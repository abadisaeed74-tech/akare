from typing import Optional

from fastapi import APIRouter, Depends, Header, Query, Request

from dependencies import get_current_user
from models import (
    CheckoutSessionRequest,
    CheckoutSessionResponse,
    CompanySettings,
    PlanChangeRequest,
    PortalSessionResponse,
    UserPublic,
)
from services.stripe_service import (
    activate_subscription_service,
    confirm_checkout_session_service,
    create_billing_portal_session_service,
    create_checkout_session_service,
    start_free_trial_service,
    stripe_webhook_service,
)
from services.audit_service import create_audit_log

router = APIRouter()

@router.post("/billing/checkout-session", response_model=CheckoutSessionResponse)
async def create_checkout_session(
    data: CheckoutSessionRequest,
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Create a Stripe Checkout session for a new subscription.
    """
    return await create_checkout_session_service(data, current_user)


@router.post("/billing/portal-session", response_model=PortalSessionResponse)
async def create_billing_portal_session(
    return_url: Optional[str] = Query(None),
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Create a Stripe Billing Portal session for cancellation/upgrade/downgrade.
    """
    return await create_billing_portal_session_service(return_url, current_user)


@router.post("/billing/confirm-checkout-session", response_model=CompanySettings)
async def confirm_checkout_session(
    request: Request,
    session_id: str = Query(..., min_length=3),
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Confirm checkout session on return from Stripe and sync company subscription state.
    Useful when webhook is delayed/unavailable in local development.
    """
    updated = await confirm_checkout_session_service(session_id, current_user)
    await create_audit_log(
        action="SUBSCRIPTION_ACTIVATED",
        entity_type="company",
        entity_id=current_user.company_owner_id or current_user.id,
        current_user=current_user,
        request=request,
        details={"source": "confirm_checkout_session"},
    )
    return updated


@router.post("/billing/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: Optional[str] = Header(None, alias="stripe-signature"),
):
    """
    Stripe webhook endpoint to sync subscription state.
    """
    return await stripe_webhook_service(request, stripe_signature)


@router.post("/billing/activate-subscription", response_model=CompanySettings)
async def activate_subscription(
    request: Request,
    data: PlanChangeRequest,
    current_user: UserPublic = Depends(get_current_user),
):
    """
    تفعيل الاشتراك في الخطة المحددة (بعد إتمام الدفع عبر Stripe).
    يقوم بتعيين plan_key وتحديد is_subscribed وتواريخ بداية ونهاية الاشتراك.
    """
    updated = await activate_subscription_service(data, current_user)
    await create_audit_log(
        action="SUBSCRIPTION_ACTIVATED",
        entity_type="company",
        entity_id=current_user.company_owner_id or current_user.id,
        current_user=current_user,
        request=request,
        details={"plan_key": data.plan_key},
    )
    return updated


@router.post("/billing/start-free-trial", response_model=CompanySettings)
async def start_free_trial(
    request: Request,
    data: PlanChangeRequest,
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Activate a one-time free trial (30 days) without payment.
    """
    updated = await start_free_trial_service(data, current_user)
    await create_audit_log(
        action="SUBSCRIPTION_ACTIVATED",
        entity_type="company",
        entity_id=current_user.company_owner_id or current_user.id,
        current_user=current_user,
        request=request,
        details={"plan_key": data.plan_key, "mode": "free_trial"},
    )
    return updated


