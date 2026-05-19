from datetime import datetime, timedelta
from typing import Dict, List, Optional

from fastapi import HTTPException, Response

from database import (
    create_client_request_db,
    create_marketing_event_db,
    create_marketing_lead_db,
    delete_platform_office_data_db,
    get_or_create_company_for_owner,
    get_platform_office_detail_db,
    get_platform_offices_overview_db,
    get_platform_stats_db,
    get_marketing_analytics_db,
    get_marketing_landing_page_details_db,
    get_marketing_landing_pages_db,
    get_marketing_lead_by_id_db,
    get_marketing_leads_db,
    get_marketing_overview_db,
    get_marketing_session_signals_db,
    get_or_create_client_profile_with_type_db,
    get_property_by_id,
    update_marketing_lead_db,
    update_company_billing_from_stripe,
)
from models import (
    CompanySettings,
    MarketingAnalytics,
    MarketingEventCreate,
    MarketingLandingPageDetails,
    MarketingLandingPageStat,
    MarketingLeadConvertRequest,
    MarketingLeadCreate,
    MarketingLeadPublic,
    MarketingLeadStatusUpdate,
    MarketingLeadUpdate,
    MarketingOverview,
    PlatformAdminSubscriptionActionRequest,
    PlatformOfficeDetail,
    PlatformOfficeSummary,
    PlatformStats,
    UserPublic,
)
from services.stripe_service import PLANS, company_settings_response, require_platform_admin
from utils.helpers import normalize_city, normalize_neighborhood
from utils.permissions import require_permission


def _owner_id(current_user: UserPublic) -> Optional[str]:
    return current_user.id if current_user.role == "owner" else current_user.company_owner_id


async def create_public_marketing_event_service(payload: MarketingEventCreate) -> Response:
    prop = await get_property_by_id(payload.property_id)
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    owner_id = prop.get("owner_id")
    if not owner_id:
        raise HTTPException(status_code=400, detail="العقار غير مرتبط بمكتب.")
    await create_marketing_event_db(owner_id, payload.model_dump(exclude_none=True))
    return Response(status_code=204)


async def create_public_marketing_lead_service(payload: MarketingLeadCreate) -> MarketingLeadPublic:
    prop = await get_property_by_id(payload.property_id)
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    owner_id = prop.get("owner_id")
    if not owner_id:
        raise HTTPException(status_code=400, detail="العقار غير مرتبط بمكتب.")

    name = (payload.name or "").strip()
    phone = (payload.phone or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="الاسم مطلوب.")
    if not phone:
        raise HTTPException(status_code=400, detail="رقم الجوال مطلوب.")

    session_signals = await get_marketing_session_signals_db(
        owner_id=owner_id,
        property_id=payload.property_id,
        session_id=payload.session_id,
    )

    doc = payload.model_dump(exclude_none=True)
    doc["submitted_form"] = True
    doc["visit_count"] = max(1, int(session_signals.get("visit_count", 0)))
    doc["clicked_whatsapp"] = bool(session_signals.get("clicked_whatsapp", False))
    doc["viewed_video"] = bool(session_signals.get("viewed_video", False))
    doc["watched_video"] = bool(session_signals.get("watched_video", False))
    doc["completed_video"] = bool(session_signals.get("completed_video", False))
    doc["session_started_at"] = session_signals.get("session_started_at")
    doc["session_last_activity_at"] = session_signals.get("session_last_activity_at")
    doc["session_duration_seconds"] = int(session_signals.get("session_duration_seconds", 0) or 0)
    doc["browser_name"] = session_signals.get("browser_name")
    doc["device_type"] = session_signals.get("device_type")
    doc["referrer"] = session_signals.get("referrer")
    doc["landing_url"] = session_signals.get("landing_url")
    lead = await create_marketing_lead_db(owner_id, doc)
    await create_marketing_event_db(
        owner_id,
        {
            "property_id": payload.property_id,
            "event_type": "form_submit",
            "ad_source": payload.ad_source,
            "session_id": payload.session_id,
            "metadata": {"request_type": payload.request_type},
        },
    )
    return MarketingLeadPublic(**lead)


async def get_marketing_overview_service(current_user: UserPublic) -> MarketingOverview:
    require_permission(current_user, "can_view_analytics")
    owner_id = _owner_id(current_user)
    if not owner_id:
        raise HTTPException(status_code=400, detail="لا يمكن تحديد شركة الحساب الحالي.")
    data = await get_marketing_overview_db(owner_id)
    return MarketingOverview(**data)


async def get_marketing_leads_service(current_user: UserPublic) -> List[MarketingLeadPublic]:
    require_permission(current_user, "can_manage_clients")
    owner_id = _owner_id(current_user)
    if not owner_id:
        return []
    rows = await get_marketing_leads_db(owner_id)
    return [MarketingLeadPublic(**row) for row in rows]


async def update_marketing_lead_status_service(
    lead_id: str,
    payload: MarketingLeadStatusUpdate,
    current_user: UserPublic,
) -> MarketingLeadPublic:
    require_permission(current_user, "can_manage_clients")
    owner_id = _owner_id(current_user)
    if not owner_id:
        raise HTTPException(status_code=400, detail="لا يمكن تحديد شركة الحساب الحالي.")
    updated = await update_marketing_lead_db(owner_id, lead_id, {"status": payload.status})
    if not updated:
        raise HTTPException(status_code=404, detail="Lead غير موجود.")
    return MarketingLeadPublic(**updated)


async def update_marketing_lead_service(
    lead_id: str,
    payload: MarketingLeadUpdate,
    current_user: UserPublic,
) -> MarketingLeadPublic:
    require_permission(current_user, "can_manage_clients")
    owner_id = _owner_id(current_user)
    if not owner_id:
        raise HTTPException(status_code=400, detail="لا يمكن تحديد شركة الحساب الحالي.")

    update_data = payload.model_dump(exclude_unset=True)
    if "notes" in update_data and isinstance(update_data.get("notes"), str):
        update_data["notes"] = update_data["notes"].strip()
    updated = await update_marketing_lead_db(owner_id, lead_id, update_data)
    if not updated:
        raise HTTPException(status_code=404, detail="Lead غير موجود.")
    return MarketingLeadPublic(**updated)


async def convert_marketing_lead_service(
    lead_id: str,
    payload: MarketingLeadConvertRequest,
    current_user: UserPublic,
) -> MarketingLeadPublic:
    require_permission(current_user, "can_manage_clients")
    owner_id = _owner_id(current_user)
    if not owner_id:
        raise HTTPException(status_code=400, detail="لا يمكن تحديد شركة الحساب الحالي.")

    lead = await get_marketing_lead_by_id_db(owner_id, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead غير موجود.")
    if lead.get("converted_to_client"):
        return MarketingLeadPublic(**lead)

    client_name = str(lead.get("name") or "عميل إعلاني")
    phone_number = str(lead.get("phone") or "").strip() or None
    property_id = str(lead.get("property_id") or "")
    prop = await get_property_by_id(property_id) if property_id else None
    property_type = str((prop or {}).get("property_type") or "غير محدد")
    city = normalize_city(str((prop or {}).get("city") or "غير محدد"))
    neighborhood = normalize_neighborhood(str((prop or {}).get("neighborhood") or "غير مذكور"))
    notes = str(lead.get("notes") or "").strip()

    converted_client_id: Optional[str] = None
    converted_client_type: Optional[str] = None

    profile = await get_or_create_client_profile_with_type_db(
        owner_id=owner_id,
        client_name=client_name,
        phone_number=phone_number,
        client_type="request",
    )

    if payload.target_type == "request":
        raw_text = (
            f"عميل محوّل من التسويق.\n"
            f"العقار: {property_type} - {city}/{neighborhood}\n"
            f"المصدر: {lead.get('ad_source', 'direct')}\n"
            f"ملاحظات: {notes or 'لا توجد'}"
        )
        created_request = await create_client_request_db(
            owner_id,
            {
                "profile_id": profile.get("id"),
                "raw_text": raw_text,
                "client_name": client_name,
                "phone_number": phone_number,
                "property_type": property_type,
                "city": city,
                "neighborhoods": [neighborhood] if neighborhood and neighborhood != "غير مذكور" else [],
                "additional_requirements": notes,
                "action_plan": "التواصل مع العميل المحوّل من قسم التسويق.",
                "status": "new",
            },
        )
        converted_client_id = created_request.get("id")
        converted_client_type = "request"
    else:
        converted_client_id = profile.get("id")
        converted_client_type = "profile"

    updated = await update_marketing_lead_db(
        owner_id,
        lead_id,
        {
            "converted_to_client": True,
            "converted_client_type": converted_client_type,
            "converted_client_id": converted_client_id,
            "status": "qualified",
        },
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Lead غير موجود.")
    return MarketingLeadPublic(**updated)


async def get_marketing_landing_pages_service(current_user: UserPublic) -> List[MarketingLandingPageStat]:
    require_permission(current_user, "can_view_analytics")
    owner_id = _owner_id(current_user)
    if not owner_id:
        return []
    rows = await get_marketing_landing_pages_db(owner_id)
    return [MarketingLandingPageStat(**row) for row in rows]


async def get_marketing_landing_page_details_service(
    property_id: str,
    current_user: UserPublic,
) -> MarketingLandingPageDetails:
    require_permission(current_user, "can_view_analytics")
    owner_id = _owner_id(current_user)
    if not owner_id:
        raise HTTPException(status_code=400, detail="لا يمكن تحديد شركة الحساب الحالي.")
    details = await get_marketing_landing_page_details_db(owner_id, property_id)
    return MarketingLandingPageDetails(**details)


async def get_marketing_analytics_service(current_user: UserPublic) -> MarketingAnalytics:
    require_permission(current_user, "can_view_analytics")
    owner_id = _owner_id(current_user)
    if not owner_id:
        return MarketingAnalytics()
    data = await get_marketing_analytics_db(owner_id)
    return MarketingAnalytics(**data)


async def get_platform_stats_service(current_user: UserPublic) -> PlatformStats:
    require_platform_admin(current_user)
    stats = await get_platform_stats_db()
    return PlatformStats(**stats)


async def get_platform_offices_service(current_user: UserPublic) -> List[PlatformOfficeSummary]:
    require_platform_admin(current_user)
    offices = await get_platform_offices_overview_db()
    return [PlatformOfficeSummary(**o) for o in offices]


async def get_platform_office_detail_service(
    owner_user_id: str,
    current_user: UserPublic,
) -> PlatformOfficeDetail:
    require_platform_admin(current_user)
    detail = await get_platform_office_detail_db(owner_user_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Office not found")
    return PlatformOfficeDetail(**detail)


async def platform_admin_subscription_action_service(
    owner_user_id: str,
    data: PlatformAdminSubscriptionActionRequest,
    current_user: UserPublic,
) -> CompanySettings:
    require_platform_admin(current_user)

    company = await get_or_create_company_for_owner(owner_user_id)
    if not company:
        raise HTTPException(status_code=404, detail="Office not found")

    now = datetime.utcnow()

    if data.action == "cancel":
        updated = await update_company_billing_from_stripe(
            owner_user_id,
            billing_status="cancelled_by_platform_admin",
            is_subscribed=False,
            cancel_at_period_end=False,
            subscription_ends_at=now,
        )
        if not updated:
            raise HTTPException(status_code=400, detail="تعذر إلغاء الاشتراك.")
        return company_settings_response(updated)

    if data.days is None:
        raise HTTPException(status_code=400, detail="عدد الأيام مطلوب لهذه العملية.")

    current_end = company.get("subscription_ends_at")
    if isinstance(current_end, str):
        try:
            current_end = datetime.fromisoformat(current_end.replace("Z", "+00:00")).replace(tzinfo=None)
        except Exception:
            current_end = None

    base_end = current_end if isinstance(current_end, datetime) and current_end > now else now
    new_end = base_end + timedelta(days=int(data.days))
    started_at = company.get("subscription_started_at") or now

    selected_plan_key = str(data.plan_key or "").strip() if data.plan_key else ""
    if data.action == "grant_free":
        next_status = "manual_free"
        if not selected_plan_key:
            selected_plan_key = str(company.get("plan_key") or "starter")
        if selected_plan_key not in PLANS:
            raise HTTPException(status_code=400, detail="الخطة المحددة غير صالحة.")
    else:
        current_status = (company.get("billing_status") or "").strip()
        next_status = current_status if current_status else "manual_extended"

    updated = await update_company_billing_from_stripe(
        owner_user_id,
        plan_key=selected_plan_key if data.action == "grant_free" else None,
        billing_status=next_status,
        is_subscribed=True,
        cancel_at_period_end=False,
        subscription_started_at=started_at,
        subscription_ends_at=new_end,
    )
    if not updated:
        raise HTTPException(status_code=400, detail="تعذر تحديث حالة الاشتراك.")
    return company_settings_response(updated)


async def delete_platform_office_service(
    owner_user_id: str,
    current_user: UserPublic,
) -> Dict[str, int | bool]:
    require_platform_admin(current_user)
    if not owner_user_id:
        raise HTTPException(status_code=400, detail="معرف المكتب غير صالح.")
    if owner_user_id == (current_user.id or ""):
        raise HTTPException(status_code=400, detail="لا يمكن حذف حسابك الإداري الحالي.")
    detail = await get_platform_office_detail_db(owner_user_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Office not found")
    deleted_counts = await delete_platform_office_data_db(owner_user_id)
    return {"deleted": True, **deleted_counts}
