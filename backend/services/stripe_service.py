from datetime import datetime
from typing import Dict, Optional

import stripe
from fastapi import HTTPException, Request

from config import (
    FREE_TRIAL_PLAN_KEY,
    FRONTEND_BASE_URL,
    PLATFORM_ADMIN_EMAILS,
    PRICE_ID_TO_PLAN_KEY,
    STRIPE_PRICE_IDS,
    STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET,
)
from database import (
    get_company_by_stripe_customer_id,
    get_or_create_company_for_owner,
    set_company_plan_db,
    set_company_stripe_customer_id,
    start_company_free_trial_db,
    update_company_billing_from_stripe,
)
from models import (
    CheckoutSessionRequest,
    CheckoutSessionResponse,
    CompanySettings,
    PlanChangeRequest,
    PortalSessionResponse,
    UserPublic,
)
from services.notification_service import create_owner_team_notification

# Keep keys aligned with existing API contracts.
PLANS: Dict[str, Dict[str, object]] = {
    "starter": {
        "key": "starter",
        "name": "خطة المكاتب الصغيرة",
        "max_users": 3,
        "max_properties": 100,
        "max_storage_mb": 2048,
        "allow_custom_subdomain": False,
        "price_monthly_sar": 99.0,
    },
    "business": {
        "key": "business",
        "name": "خطة المكاتب المتوسطة",
        "max_users": 10,
        "max_properties": 500,
        "max_storage_mb": 10240,
        "allow_custom_subdomain": True,
        "price_monthly_sar": 199.0,
    },
    "enterprise": {
        "key": "enterprise",
        "name": "خطة الشركات",
        "max_users": 50,
        "max_properties": 5000,
        "max_storage_mb": 102400,
        "allow_custom_subdomain": True,
        "price_monthly_sar": 599.0,
    },
}


def ensure_stripe_ready(plan_key: Optional[str] = None) -> None:
    if not STRIPE_SECRET_KEY:
        raise HTTPException(
            status_code=500,
            detail="Stripe غير مهيأ. يرجى إضافة STRIPE_SECRET_KEY في إعدادات البيئة.",
        )
    if plan_key:
        price_id = STRIPE_PRICE_IDS.get(plan_key)
        if not price_id:
            raise HTTPException(
                status_code=500,
                detail=f"Stripe price id غير مهيأ للخطة: {plan_key}",
            )


def company_settings_response(company: Dict) -> CompanySettings:
    return CompanySettings(
        company_name=company.get("company_name"),
        logo_url=company.get("logo_url"),
        official_email=company.get("official_email"),
        contact_phone=company.get("contact_phone"),
        subdomain=company.get("subdomain"),
        plan_key=company.get("plan_key", "starter"),
        is_subscribed=company.get("is_subscribed", False),
        subscription_started_at=company.get("subscription_started_at"),
        subscription_ends_at=company.get("subscription_ends_at"),
        billing_status=company.get("billing_status"),
        cancel_at_period_end=company.get("cancel_at_period_end", False),
        trial_used=company.get("trial_used", False),
    )


async def refresh_trial_subscription_state(owner_user_id: str) -> Dict:
    company = await get_or_create_company_for_owner(owner_user_id)
    if not company.get("is_subscribed", False):
        return company
    auto_expiring_statuses = {"trialing", "manual_free", "manual_extended"}
    if company.get("billing_status") not in auto_expiring_statuses:
        return company

    ends_at = company.get("subscription_ends_at")
    if not ends_at:
        return company

    if isinstance(ends_at, str):
        try:
            ends_at = datetime.fromisoformat(ends_at.replace("Z", "+00:00")).replace(tzinfo=None)
        except Exception:
            return company

    if isinstance(ends_at, datetime) and ends_at <= datetime.utcnow():
        updated = await update_company_billing_from_stripe(
            owner_user_id,
            billing_status="trial_ended",
            is_subscribed=False,
            cancel_at_period_end=False,
        )
        if updated:
            return updated

    return company


def require_platform_admin(current_user: UserPublic) -> None:
    email = (current_user.email or "").strip().lower()
    if email not in PLATFORM_ADMIN_EMAILS:
        raise HTTPException(status_code=403, detail="هذه الصفحة متاحة لمالك المنصة فقط.")


def stripe_obj_to_dict(value):
    if value is None:
        return None
    if isinstance(value, dict):
        return {k: stripe_obj_to_dict(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [stripe_obj_to_dict(v) for v in value]
    for method_name in ("to_dict_recursive", "to_dict"):
        method = getattr(value, method_name, None)
        if callable(method):
            try:
                return stripe_obj_to_dict(method())
            except Exception:
                pass
    items_method = getattr(value, "items", None)
    if callable(items_method):
        try:
            return {k: stripe_obj_to_dict(v) for k, v in items_method()}
        except Exception:
            pass
    return value


async def create_checkout_session_service(
    data: CheckoutSessionRequest,
    current_user: UserPublic,
) -> CheckoutSessionResponse:
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="فقط مالك الحساب يمكنه بدء عملية الدفع.")

    plan_key = data.plan_key
    if plan_key not in PLANS:
        raise HTTPException(status_code=400, detail="الخطة غير معروفة.")
    ensure_stripe_ready(plan_key)

    company = await get_or_create_company_for_owner(current_user.id)
    price_id = STRIPE_PRICE_IDS[plan_key]
    success_url = data.success_url or f"{FRONTEND_BASE_URL}/billing/checkout?status=success"
    cancel_url = data.cancel_url or f"{FRONTEND_BASE_URL}/billing/checkout?status=cancel"

    stripe_customer_id = company.get("stripe_customer_id")
    if stripe_customer_id:
        customer_id = stripe_customer_id
    else:
        customer = stripe.Customer.create(
            email=current_user.email,
            metadata={"owner_user_id": current_user.id},
        )
        customer_id = customer["id"]
        await set_company_stripe_customer_id(current_user.id, customer_id)

    session = stripe.checkout.Session.create(
        mode="subscription",
        customer=customer_id,
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={"owner_user_id": current_user.id, "plan_key": plan_key},
        subscription_data={
            "metadata": {"owner_user_id": current_user.id, "plan_key": plan_key}
        },
    )
    return CheckoutSessionResponse(url=session["url"], session_id=session["id"])


async def create_billing_portal_session_service(
    return_url: Optional[str],
    current_user: UserPublic,
) -> PortalSessionResponse:
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="فقط مالك الحساب يمكنه إدارة الاشتراك.")
    ensure_stripe_ready()
    company = await get_or_create_company_for_owner(current_user.id)
    stripe_customer_id = company.get("stripe_customer_id")
    if not stripe_customer_id:
        raise HTTPException(
            status_code=400,
            detail="لا يوجد عميل Stripe مرتبط بهذا الحساب بعد. ابدأ الاشتراك أولاً.",
        )

    session = stripe.billing_portal.Session.create(
        customer=stripe_customer_id,
        return_url=return_url or f"{FRONTEND_BASE_URL}/settings",
    )
    return PortalSessionResponse(url=session["url"])


async def confirm_checkout_session_service(
    session_id: str,
    current_user: UserPublic,
) -> CompanySettings:
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="فقط مالك الحساب يمكنه تأكيد الاشتراك.")
    ensure_stripe_ready()

    try:
        session = stripe.checkout.Session.retrieve(session_id)
        session = stripe_obj_to_dict(session)
    except Exception:
        raise HTTPException(status_code=400, detail="تعذّر قراءة جلسة الدفع من Stripe.")

    if session.get("mode") != "subscription":
        raise HTTPException(status_code=400, detail="جلسة Stripe ليست اشتراكًا.")
    if session.get("payment_status") not in {"paid", "no_payment_required"}:
        raise HTTPException(status_code=400, detail="الدفع لم يكتمل بعد.")

    customer_id = session.get("customer")
    subscription_id = session.get("subscription")
    metadata = stripe_obj_to_dict(session.get("metadata", {}))
    plan_key = metadata.get("plan_key")

    if not subscription_id:
        raise HTTPException(status_code=400, detail="لا يوجد اشتراك مرتبط بجلسة الدفع.")

    try:
        subscription = stripe.Subscription.retrieve(subscription_id)
        subscription = stripe_obj_to_dict(subscription)
    except Exception:
        raise HTTPException(status_code=400, detail="تعذّر قراءة بيانات الاشتراك من Stripe.")

    items = stripe_obj_to_dict(subscription.get("items", {}))
    item_list = items.get("data") or [{}]
    current_item = stripe_obj_to_dict(item_list[0])
    price_dict = stripe_obj_to_dict(current_item.get("price", {}))
    price_id = price_dict.get("id")
    mapped_plan = PRICE_ID_TO_PLAN_KEY.get(price_id)
    final_plan_key = mapped_plan or plan_key or "starter"

    stripe_status = subscription.get("status")
    cancel_at_period_end = bool(subscription.get("cancel_at_period_end", False))
    current_period_start_unix = subscription.get("current_period_start")
    current_period_end_unix = subscription.get("current_period_end")
    is_subscribed = stripe_status in {"active", "trialing", "past_due"}

    subscription_started_at = (
        datetime.utcfromtimestamp(current_period_start_unix)
        if current_period_start_unix
        else None
    )
    subscription_ends_at = (
        datetime.utcfromtimestamp(current_period_end_unix)
        if current_period_end_unix
        else None
    )

    updated = await update_company_billing_from_stripe(
        current_user.id,
        stripe_customer_id=customer_id,
        stripe_subscription_id=subscription_id,
        plan_key=final_plan_key,
        billing_status=stripe_status,
        cancel_at_period_end=cancel_at_period_end,
        is_subscribed=is_subscribed,
        subscription_started_at=subscription_started_at,
        subscription_ends_at=subscription_ends_at,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Company not found")
    await create_owner_team_notification(
        owner_id=current_user.id,
        type="subscription_payment_success",
        category="billing",
        title="تم تأكيد الدفع بنجاح",
        message="تم تفعيل الاشتراك وتحديث حالة الفوترة.",
        priority="high",
        link="/settings?section=billing",
    )
    return company_settings_response(updated)


async def stripe_webhook_service(
    request: Request,
    stripe_signature: Optional[str],
) -> Dict[str, bool]:
    ensure_stripe_ready()
    payload = await request.body()
    if not STRIPE_WEBHOOK_SECRET:
        raise HTTPException(
            status_code=500,
            detail="Stripe webhook غير مهيأ. يرجى إضافة STRIPE_WEBHOOK_SECRET.",
        )
    if not stripe_signature:
        raise HTTPException(status_code=400, detail="Missing Stripe signature header.")

    try:
        event = stripe.Webhook.construct_event(payload, stripe_signature, STRIPE_WEBHOOK_SECRET)
        event = stripe_obj_to_dict(event)
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid Stripe signature.")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid webhook payload.")

    event_type = event.get("type")
    data_object = stripe_obj_to_dict(event.get("data", {}).get("object", {}))

    if event_type == "checkout.session.completed":
        metadata = stripe_obj_to_dict(data_object.get("metadata", {}))
        owner_user_id = metadata.get("owner_user_id") or data_object.get("client_reference_id")
        customer_id = data_object.get("customer")
        subscription_id = data_object.get("subscription")
        plan_key = metadata.get("plan_key")
        if owner_user_id:
            await update_company_billing_from_stripe(
                owner_user_id,
                stripe_customer_id=customer_id,
                stripe_subscription_id=subscription_id,
                plan_key=plan_key,
            )

    if event_type in {
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
    }:
        customer_id = data_object.get("customer")
        company = await get_company_by_stripe_customer_id(customer_id) if customer_id else None
        if company:
            stripe_status = data_object.get("status")
            cancel_at_period_end = bool(data_object.get("cancel_at_period_end", False))
            current_period_end_unix = data_object.get("current_period_end")
            current_period_start_unix = data_object.get("current_period_start")
            items = stripe_obj_to_dict(data_object.get("items", {}))
            item_list = items.get("data") or [{}]
            current_item = stripe_obj_to_dict(item_list[0])
            price_dict = stripe_obj_to_dict(current_item.get("price", {}))
            price_id = price_dict.get("id")
            plan_key = PRICE_ID_TO_PLAN_KEY.get(price_id) or company.get("plan_key")
            is_subscribed = stripe_status in {"active", "trialing", "past_due"}

            subscription_started_at = (
                datetime.utcfromtimestamp(current_period_start_unix)
                if current_period_start_unix
                else None
            )
            subscription_ends_at = (
                datetime.utcfromtimestamp(current_period_end_unix)
                if current_period_end_unix
                else None
            )

            await update_company_billing_from_stripe(
                company["owner_user_id"],
                stripe_subscription_id=data_object.get("id"),
                plan_key=plan_key,
                billing_status=stripe_status,
                cancel_at_period_end=cancel_at_period_end,
                is_subscribed=is_subscribed,
                subscription_started_at=subscription_started_at,
                subscription_ends_at=subscription_ends_at,
            )

    return {"received": True}


async def activate_subscription_service(
    data: PlanChangeRequest,
    current_user: UserPublic,
) -> CompanySettings:
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="فقط مالك الحساب يمكنه تفعيل الاشتراك.")
    plan_key = data.plan_key
    if plan_key not in PLANS:
        raise HTTPException(status_code=400, detail="الخطة غير معروفة.")

    updated = await set_company_plan_db(current_user.id, plan_key)
    if not updated:
        raise HTTPException(status_code=404, detail="Company not found")
    return company_settings_response(updated)


async def start_free_trial_service(
    data: PlanChangeRequest,
    current_user: UserPublic,
) -> CompanySettings:
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="فقط مالك الحساب يمكنه بدء التجربة المجانية.")

    plan_key = data.plan_key
    if plan_key not in PLANS:
        raise HTTPException(status_code=400, detail="الخطة غير معروفة.")
    if plan_key != FREE_TRIAL_PLAN_KEY:
        raise HTTPException(
            status_code=400,
            detail="الشهر المجاني متاح فقط للخطة الأساسية.",
        )

    company = await refresh_trial_subscription_state(current_user.id)
    if company.get("is_subscribed", False):
        raise HTTPException(status_code=400, detail="لديك اشتراك نشط بالفعل.")
    if company.get("trial_used", False):
        raise HTTPException(status_code=400, detail="تم استخدام الشهر المجاني مسبقًا لهذا الحساب.")

    updated = await start_company_free_trial_db(current_user.id, plan_key, trial_days=30)
    if not updated:
        raise HTTPException(status_code=400, detail="تعذر بدء التجربة المجانية.")
    await create_owner_team_notification(
        owner_id=current_user.id,
        type="free_trial_started",
        category="billing",
        title="بدء التجربة المجانية",
        message="تم تفعيل التجربة المجانية بنجاح.",
        link="/settings?section=plans",
    )
    return company_settings_response(updated)
