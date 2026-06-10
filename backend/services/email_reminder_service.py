import asyncio
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, Optional
from zoneinfo import ZoneInfo

from bson import ObjectId

from config import EMAIL_REMINDER_SCHEDULER_SECONDS, FRONTEND_BASE_URL
from database import (
    client_offer_collection,
    client_request_collection,
    company_collection,
    get_or_create_company_for_owner,
    get_user_by_id,
)
from services.email_service import is_brevo_configured, send_email
from services.subscription_state import derive_subscription_snapshot

logger = logging.getLogger(__name__)
RIYADH_TZ = ZoneInfo("Asia/Riyadh")
UTC_TZ = ZoneInfo("UTC")

SUBSCRIPTION_PLAN_NAMES = {
    "starter": "خطة المكاتب الصغيرة",
    "business": "خطة المكاتب المتوسطة",
    "enterprise": "خطة الشركات",
}


def _to_utc(dt: Any) -> Optional[datetime]:
    if not isinstance(dt, datetime):
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC_TZ)
    return dt.astimezone(UTC_TZ)


def _format_riyadh_date_time(dt: datetime) -> tuple[str, str]:
    r = dt.astimezone(RIYADH_TZ)
    return r.strftime("%Y-%m-%d"), r.strftime("%I:%M %p")


def _activity_label(reminder_type: Optional[str]) -> str:
    if reminder_type == "viewing":
        return "معاينة"
    if reminder_type == "follow_up":
        return "متابعة"
    return "موعد"


async def _send_appointment_email_for_doc(
    *,
    doc: Dict[str, Any],
    source: str,
    now_utc: datetime,
) -> bool:
    owner_id = str(doc.get("owner_id") or "")
    if not owner_id:
        return False

    deadline_at = _to_utc(doc.get("deadline_at"))
    if not deadline_at:
        return False

    reminder_before = int(doc.get("reminder_before_minutes", 120) or 120)
    trigger_at = deadline_at - timedelta(minutes=reminder_before)
    if now_utc < trigger_at or now_utc > deadline_at:
        return False

    company = await get_or_create_company_for_owner(owner_id)
    owner_user = await get_user_by_id(owner_id)
    assignee_id = str(doc.get("assigned_user_id") or "").strip()
    assignee_user = await get_user_by_id(assignee_id) if assignee_id else None

    owner_email = (owner_user or {}).get("email")
    assignee_email = (assignee_user or {}).get("email")
    assignee_name = (
        (assignee_user or {}).get("display_name")
        or (doc.get("assigned_user_name") or "").strip()
        or (assignee_user or {}).get("email")
        or "غير محدد"
    )

    to_email = assignee_email or owner_email
    if not to_email:
        return False

    cc_owner_enabled = bool(company.get("appointment_reminder_email_cc_owner", True))
    cc_emails = []
    if cc_owner_enabled and owner_email and owner_email != to_email:
        cc_emails.append(owner_email)

    date_str, time_str = _format_riyadh_date_time(deadline_at)
    reminder_type = _activity_label(doc.get("reminder_type"))
    client_name = (doc.get("client_name") or "غير محدد").strip() or "غير محدد"
    notes = (
        (doc.get("follow_up_details") or "").strip()
        or (doc.get("action_plan") or "").strip()
        or (doc.get("notes") or "").strip()
        or "لا توجد"
    )

    source_label = "طلب عميل" if source == "request" else "عرض عميل"
    subject = f"تذكير {reminder_type} - {client_name}"
    body = (
        "مرحبًا،\n\n"
        "هذا تذكير بموعد قادم في منصة عقاري:\n"
        f"- اسم العميل: {client_name}\n"
        f"- نوع النشاط: {reminder_type}\n"
        f"- المصدر: {source_label}\n"
        f"- التاريخ: {date_str}\n"
        f"- الوقت: {time_str} (Asia/Riyadh)\n"
        f"- ملاحظات الموعد: {notes}\n"
        f"- الموظف المسؤول: {assignee_name}\n\n"
        "تحياتنا,\n"
        "Akare"
    )

    ok = await send_email(
        to_email=to_email,
        cc_emails=cc_emails,
        subject=subject,
        plain_text=body,
    )
    if not ok:
        return False

    sent_field = "reminder_email_sent_at"
    collection = client_request_collection if source == "request" else client_offer_collection
    await collection.update_one(
        {"_id": doc.get("_id"), "owner_id": owner_id},
        {"$set": {sent_field: now_utc.replace(tzinfo=None), "updated_at": now_utc.replace(tzinfo=None)}},
    )
    return True


async def process_appointment_email_reminders() -> None:
    if not is_brevo_configured():
        return

    now_utc = datetime.now(tz=UTC_TZ)
    base_query: Dict[str, Any] = {
        "deadline_at": {"$ne": None},
        "$or": [
            {"reminder_email_sent_at": {"$exists": False}},
            {"reminder_email_sent_at": None},
        ],
    }

    async for request_doc in client_request_collection.find(
        {**base_query, "status": {"$ne": "closed"}}
    ).limit(500):
        try:
            await _send_appointment_email_for_doc(doc=request_doc, source="request", now_utc=now_utc)
        except Exception:
            logger.exception("Appointment reminder processing failed for request")

    async for offer_doc in client_offer_collection.find(
        {**base_query, "status": {"$ne": "closed"}}
    ).limit(500):
        try:
            await _send_appointment_email_for_doc(doc=offer_doc, source="offer", now_utc=now_utc)
        except Exception:
            logger.exception("Appointment reminder processing failed for offer")


async def _send_subscription_email_if_due(company_doc: Dict[str, Any], now_utc: datetime) -> None:
    owner_id = str(company_doc.get("owner_user_id") or "")
    if not owner_id:
        return
    owner_user = await get_user_by_id(owner_id)
    owner_email = (owner_user or {}).get("email")
    if not owner_email:
        return

    snapshot = derive_subscription_snapshot(company_doc, now_utc=now_utc)
    ends_at = _to_utc(company_doc.get("subscription_ends_at"))
    if not ends_at:
        return

    now_riyadh = now_utc.astimezone(RIYADH_TZ).date()
    end_riyadh = ends_at.astimezone(RIYADH_TZ).date()
    days_left = (end_riyadh - now_riyadh).days

    company_name = (company_doc.get("company_name") or "مكتبك العقاري").strip() or "مكتبك العقاري"
    plan_key = (company_doc.get("plan_key") or "starter").strip() or "starter"
    plan_name = SUBSCRIPTION_PLAN_NAMES.get(plan_key, plan_key)
    end_date_str = str(snapshot.get("subscription_end_date_gregorian") or end_riyadh.strftime("%Y-%m-%d"))
    renew_link = f"{FRONTEND_BASE_URL}/settings?section=plans"

    flag_map = {
        7: "subscription_reminder_7d_sent",
        3: "subscription_reminder_3d_sent",
        1: "subscription_reminder_1d_sent",
        0: "subscription_reminder_0d_sent",
    }

    flag = flag_map.get(days_left)
    if days_left < 0:
        flag = "subscription_expired_sent"
    if not flag:
        return
    if company_doc.get(flag):
        return

    if days_left > 0:
        subject = f"تذكير: اشتراك {company_name} ينتهي خلال {days_left} يوم"
    elif days_left == 0:
        subject = f"تنبيه: اشتراك {company_name} ينتهي اليوم"
    else:
        subject = f"تنبيه: اشتراك {company_name} انتهى"

    body = (
        "مرحبًا،\n\n"
        "هذا تذكير بحالة اشتراك مكتبك:\n"
        f"- اسم المكتب: {company_name}\n"
        f"- الخطة الحالية: {plan_name}\n"
        f"- تاريخ انتهاء الاشتراك: {end_date_str}\n"
        f"- رابط التجديد: {renew_link}\n\n"
        "تحياتنا,\n"
        "Akare"
    )

    ok = await send_email(to_email=owner_email, subject=subject, plain_text=body)
    if not ok:
        return

    await company_collection.update_one(
        {"_id": ObjectId(company_doc["_id"])},
        {
            "$set": {
                flag: True,
                f"{flag}_at": now_utc.replace(tzinfo=None),
                "updated_at": now_utc.replace(tzinfo=None),
            }
        },
    )


async def process_subscription_email_reminders() -> None:
    if not is_brevo_configured():
        return
    now_utc = datetime.now(tz=UTC_TZ)
    async for company_doc in company_collection.find({"subscription_ends_at": {"$ne": None}}).limit(1000):
        try:
            await _send_subscription_email_if_due(company_doc, now_utc)
        except Exception:
            logger.exception("Subscription reminder processing failed")


async def process_email_reminders_cycle() -> None:
    await process_appointment_email_reminders()
    await process_subscription_email_reminders()


async def run_email_reminders_scheduler(stop_event: asyncio.Event) -> None:
    interval = max(30, int(EMAIL_REMINDER_SCHEDULER_SECONDS or 60))
    logger.info("Email reminders scheduler started (interval=%ss)", interval)
    while not stop_event.is_set():
        try:
            await process_email_reminders_cycle()
        except Exception:
            logger.exception("Email reminders scheduler cycle failed")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval)
        except asyncio.TimeoutError:
            continue
    logger.info("Email reminders scheduler stopped")
