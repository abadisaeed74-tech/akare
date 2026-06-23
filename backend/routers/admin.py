from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from dependencies import get_current_user
from models import (
    AuditLogsResponse,
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
from services.audit_service import create_audit_log, list_audit_logs_service

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
    request: Request,
    owner_user_id: str,
    data: PlatformAdminSubscriptionActionRequest,
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Platform admin can extend subscription or grant manual free period by days.
    """
    updated = await platform_admin_subscription_action_service(owner_user_id, data, current_user)
    await create_audit_log(
        action="SUBSCRIPTION_RENEWED" if data.action in {"extend", "grant_free"} else "SUBSCRIPTION_EXPIRED",
        entity_type="company",
        entity_id=owner_user_id,
        current_user=current_user,
        request=request,
        company_owner_id=owner_user_id,
        details={"admin_action": data.action, "days": str(data.days or "")},
    )
    return updated


@router.delete("/admin/platform-offices/{owner_user_id}")
async def delete_platform_office(
    request: Request,
    owner_user_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Permanently delete an office and all related data.
    """
    result = await delete_platform_office_service(owner_user_id, current_user)
    await create_audit_log(
        action="DELETE_OFFICE",
        entity_type="company",
        entity_id=owner_user_id,
        current_user=current_user,
        request=request,
        company_owner_id=owner_user_id,
        details={k: str(v) for k, v in result.items()},
    )
    return result


@router.get("/admin/audit-logs", response_model=AuditLogsResponse)
async def list_audit_logs(
    company_owner_id: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_user: UserPublic = Depends(get_current_user),
):
    try:
        payload = await list_audit_logs_service(
            current_user=current_user,
            company_owner_id=company_owner_id,
            user_id=user_id,
            action=action,
            search=search,
            date_from=date_from,
            date_to=date_to,
            page=page,
            page_size=page_size,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    return AuditLogsResponse(**payload)


