from typing import List

from fastapi import APIRouter, Depends, Request

from dependencies import get_current_user
from models import (
    CompanySettings,
    CompanySettingsUpdate,
    EmployeeCreate,
    EmployeeUpdate,
    PlanChangeRequest,
    PlanInfo,
    PlanUsage,
    SettingsOverview,
    SubdomainCheckResponse,
    SubdomainRequest,
    TeamUserPublic,
    UserPublic,
)
from services.audit_service import create_audit_log
from services.settings_service import (
    change_plan_service,
    check_subdomain_service,
    create_team_user_service,
    get_settings_overview_service,
    list_plans_service,
    list_team_users_service,
    update_company_settings_service,
    update_subdomain_service,
    update_team_user_service,
)

router = APIRouter()


@router.get("/settings/overview", response_model=SettingsOverview)
async def get_settings_overview(current_user: UserPublic = Depends(get_current_user)):
    return await get_settings_overview_service(current_user)


@router.put("/settings/company", response_model=CompanySettings)
async def update_company_settings(
    settings: CompanySettingsUpdate,
    current_user: UserPublic = Depends(get_current_user),
):
    return await update_company_settings_service(settings, current_user)


@router.get("/settings/plans", response_model=List[PlanInfo])
async def list_plans(current_user: UserPublic = Depends(get_current_user)):
    return await list_plans_service(current_user)


@router.put("/settings/plan", response_model=PlanUsage)
async def change_plan(
    data: PlanChangeRequest,
    current_user: UserPublic = Depends(get_current_user),
):
    return await change_plan_service(data, current_user)


@router.post("/settings/subdomain/check", response_model=SubdomainCheckResponse)
async def check_subdomain(
    data: SubdomainRequest,
    current_user: UserPublic = Depends(get_current_user),
):
    return await check_subdomain_service(data, current_user)


@router.put("/settings/subdomain", response_model=CompanySettings)
async def update_subdomain(
    data: SubdomainRequest,
    current_user: UserPublic = Depends(get_current_user),
):
    return await update_subdomain_service(data, current_user)


@router.get("/settings/team/users", response_model=List[TeamUserPublic])
async def list_team_users(current_user: UserPublic = Depends(get_current_user)):
    return await list_team_users_service(current_user)


@router.post("/settings/team/users", response_model=TeamUserPublic)
async def create_team_user(
    request: Request,
    data: EmployeeCreate,
    current_user: UserPublic = Depends(get_current_user),
):
    created = await create_team_user_service(data, current_user)
    await create_audit_log(
        action="CREATE_EMPLOYEE",
        entity_type="employee",
        entity_id=created.id,
        current_user=current_user,
        request=request,
    )
    return created


@router.put("/settings/team/users/{user_id}", response_model=TeamUserPublic)
async def update_team_user(
    request: Request,
    user_id: str,
    data: EmployeeUpdate,
    current_user: UserPublic = Depends(get_current_user),
):
    updated = await update_team_user_service(user_id, data, current_user)
    action = "UPDATE_EMPLOYEE"
    if data.status == "disabled":
        action = "DISABLE_EMPLOYEE"
    elif data.status == "active":
        action = "UPDATE_EMPLOYEE"
    await create_audit_log(
        action=action,
        entity_type="employee",
        entity_id=updated.id,
        current_user=current_user,
        request=request,
    )
    return updated
