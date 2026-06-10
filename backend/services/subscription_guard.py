from typing import Optional

from fastapi import HTTPException

from models import UserPublic
from services.stripe_service import refresh_trial_subscription_state

CLIENTS_READ_ONLY_SUBSCRIPTION_MESSAGE = (
    "انتهى اشتراكك. يمكنك استعراض بياناتك الحالية فقط حتى يتم تجديد الاشتراك."
)
MATCHING_READ_ONLY_SUBSCRIPTION_MESSAGE = (
    "انتهى اشتراكك. نظام المطابقة متاح للعرض فقط بعد تجديد الاشتراك."
)


def resolve_owner_id(current_user: UserPublic) -> Optional[str]:
    return current_user.id if current_user.role == "owner" else current_user.company_owner_id


async def require_active_subscription_for_client_writes(
    current_user: UserPublic,
    detail: str = CLIENTS_READ_ONLY_SUBSCRIPTION_MESSAGE,
) -> str:
    owner_id = resolve_owner_id(current_user)
    if not owner_id:
        raise HTTPException(status_code=400, detail="لا يمكن تحديد شركة الحساب الحالي.")

    company = await refresh_trial_subscription_state(owner_id)
    if not company.get("is_subscribed", False):
        raise HTTPException(status_code=403, detail=detail)
    return owner_id


async def require_active_subscription_for_matching(
    current_user: UserPublic,
    detail: str = MATCHING_READ_ONLY_SUBSCRIPTION_MESSAGE,
) -> str:
    owner_id = resolve_owner_id(current_user)
    if not owner_id:
        raise HTTPException(status_code=400, detail="لا يمكن تحديد شركة الحساب الحالي.")

    company = await refresh_trial_subscription_state(owner_id)
    if not company.get("is_subscribed", False):
        raise HTTPException(status_code=403, detail=detail)
    return owner_id
