from typing import List

from fastapi import APIRouter, Depends

from dependencies import get_current_user
from models import (
    CompanySettings,
    PlatformAdminSubscriptionActionRequest,
    PlatformOfficeDetail,
    PlatformOfficeSummary,
    PlatformStats,
    UserPublic,
)
from services.analytics_service import (
    delete_platform_office_service,
    get_platform_office_detail_service,
    get_platform_offices_service,
    get_platform_stats_service,
    platform_admin_subscription_action_service,
)

router = APIRouter()

@router.get("/admin/platform-stats", response_model=PlatformStats)
async def get_platform_stats(current_user: UserPublic = Depends(get_current_user)):
    """
    Platform-wide stats for product owner/admin dashboard.
    """
    return await get_platform_stats_service(current_user)


@router.get("/admin/platform-offices", response_model=List[PlatformOfficeSummary])
async def get_platform_offices(current_user: UserPublic = Depends(get_current_user)):
    """
    Platform-wide offices list with per-office aggregates.
    """
    return await get_platform_offices_service(current_user)


@router.get("/admin/platform-offices/{owner_user_id}", response_model=PlatformOfficeDetail)
async def get_platform_office_detail(
    owner_user_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Full office details for platform admin.
    """
    return await get_platform_office_detail_service(owner_user_id, current_user)


@router.post("/admin/platform-offices/{owner_user_id}/subscription-action", response_model=CompanySettings)
async def platform_admin_subscription_action(
    owner_user_id: str,
    data: PlatformAdminSubscriptionActionRequest,
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Platform admin can extend subscription or grant manual free period by days.
    """
    return await platform_admin_subscription_action_service(owner_user_id, data, current_user)


@router.delete("/admin/platform-offices/{owner_user_id}")
async def delete_platform_office(
    owner_user_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Permanently delete an office and all related data.
    """
    return await delete_platform_office_service(owner_user_id, current_user)


