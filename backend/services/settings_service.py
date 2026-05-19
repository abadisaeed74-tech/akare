import re
from typing import Dict, List

from fastapi import HTTPException

from database import (
    count_assigned_clients_for_user,
    count_assigned_properties_for_user,
    count_properties_for_owner,
    create_employee_user,
    get_company_by_subdomain,
    get_or_create_company_for_owner,
    get_team_for_owner,
    get_user_by_email,
    set_company_subdomain_db,
    update_company_settings_db,
    update_employee_user,
)
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
from services.property_service import get_plan
from services.notification_service import create_owner_team_notification
from services.stripe_service import PLANS, company_settings_response, refresh_trial_subscription_state
from utils.security import get_password_hash


async def get_settings_overview_service(current_user: UserPublic) -> SettingsOverview:
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="هذه الصفحة متاحة لمالك الحساب فقط.")

    company = await refresh_trial_subscription_state(current_user.id)
    plan = PlanInfo(**get_plan(company.get("plan_key", "starter")))

    raw_team = await get_team_for_owner(current_user.id)
    team: List[TeamUserPublic] = []
    for u in raw_team:
        user_id = u["id"]
        display_name = (u.get("display_name") or "").strip() or u.get("email")
        assigned_clients_count = 0 if u.get("role") == "owner" else await count_assigned_clients_for_user(current_user.id, user_id)
        assigned_properties_count = 0 if u.get("role") == "owner" else await count_assigned_properties_for_user(current_user.id, user_id)
        team.append(
            TeamUserPublic(
                id=user_id,
                email=u["email"],
                role=u.get("role", "owner"),
                status=u.get("status", "active"),
                display_name=display_name,
                permissions=u.get("permissions") or {},
                assigned_clients_count=assigned_clients_count,
                assigned_properties_count=assigned_properties_count,
            )
        )

    current_properties = await count_properties_for_owner(current_user.id)
    plan_usage = PlanUsage(
        plan=plan,
        current_users=len(team),
        current_properties=current_properties,
        used_storage_mb=None,
    )

    company_settings = CompanySettings(
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
    return SettingsOverview(company=company_settings, plan_usage=plan_usage, team=team)


async def update_company_settings_service(settings: CompanySettingsUpdate, current_user: UserPublic) -> CompanySettings:
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="فقط مالك الحساب يمكنه تعديل إعدادات الشركة.")
    updated = await update_company_settings_db(current_user.id, settings.model_dump(exclude_unset=True))
    if not updated:
        raise HTTPException(status_code=404, detail="Company not found")
    return company_settings_response(updated)


async def list_plans_service(current_user: UserPublic) -> List[PlanInfo]:
    _ = current_user
    return [PlanInfo(**p) for p in PLANS.values()]


async def change_plan_service(data: PlanChangeRequest, current_user: UserPublic) -> PlanUsage:
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="فقط مالك الحساب يمكنه تغيير الخطة.")
    plan_key = data.plan_key
    if plan_key not in PLANS:
        raise HTTPException(status_code=400, detail="الخطة غير معروفة.")
    plan = PlanInfo(**get_plan(plan_key))
    current_properties = await count_properties_for_owner(current_user.id)
    team = await get_team_for_owner(current_user.id)
    return PlanUsage(
        plan=plan,
        current_users=len(team),
        current_properties=current_properties,
        used_storage_mb=None,
    )


async def check_subdomain_service(data: SubdomainRequest, current_user: UserPublic) -> SubdomainCheckResponse:
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="فقط مالك الحساب يمكنه إدارة السب دومين.")
    value = (data.subdomain or "").strip().lower()
    if not value:
        return SubdomainCheckResponse(ok=False, message="الرجاء إدخال سب دومين.")

    reserved = {"www", "admin", "api", "support", "dashboard"}
    valid_pattern = re.compile(r"^[a-z0-9-]{3,30}$")
    if not valid_pattern.match(value):
        return SubdomainCheckResponse(
            ok=False,
            message="السب دومين يجب أن يكون بحروف إنجليزية وأرقام وشرطة (-) فقط وبين 3 و 30 حرف.",
        )
    if value in reserved:
        return SubdomainCheckResponse(ok=False, message="هذا الاسم محجوز ولا يمكن استخدامه.")

    existing = await get_company_by_subdomain(value)
    if existing and existing.get("owner_user_id") != current_user.id:
        return SubdomainCheckResponse(ok=False, message="هذا السب دومين مستخدم من شركة أخرى.")
    return SubdomainCheckResponse(ok=True, message="السب دومين متاح للاستخدام.")


async def update_subdomain_service(data: SubdomainRequest, current_user: UserPublic) -> CompanySettings:
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="فقط مالك الحساب يمكنه إدارة السب دومين.")
    company = await refresh_trial_subscription_state(current_user.id)
    plan_dict = get_plan(company.get("plan_key", "starter"))
    if not plan_dict.get("allow_custom_subdomain", False):
        raise HTTPException(
            status_code=403,
            detail="خطة الاشتراك الحالية لا تسمح باستخدام سب دومين مخصص. يرجى الترقية أولاً.",
        )
    check_result = await check_subdomain_service(data, current_user)
    if not check_result.ok:
        raise HTTPException(status_code=400, detail=check_result.message)
    updated = await set_company_subdomain_db(current_user.id, data.subdomain.strip().lower())
    if not updated:
        raise HTTPException(status_code=404, detail="Company not found")
    return company_settings_response(updated)


async def list_team_users_service(current_user: UserPublic) -> List[TeamUserPublic]:
    if current_user.role not in {"owner", "manager"}:
        raise HTTPException(status_code=403, detail="فقط مالك الحساب يمكنه إدارة المستخدمين.")
    owner_id = current_user.id if current_user.role == "owner" else current_user.company_owner_id
    if not owner_id:
        return []
    raw_team = await get_team_for_owner(owner_id)
    team: List[TeamUserPublic] = []
    for u in raw_team:
        user_id = u["id"]
        display_name = (u.get("display_name") or "").strip() or u.get("email")
        assigned_clients_count = 0 if u.get("role") == "owner" else await count_assigned_clients_for_user(owner_id, user_id)
        assigned_properties_count = 0 if u.get("role") == "owner" else await count_assigned_properties_for_user(owner_id, user_id)
        team.append(
            TeamUserPublic(
                id=user_id,
                email=u["email"],
                role=u.get("role", "owner"),
                status=u.get("status", "active"),
                display_name=display_name,
                permissions=u.get("permissions") or {},
                assigned_clients_count=assigned_clients_count,
                assigned_properties_count=assigned_properties_count,
            )
        )
    return team


async def create_team_user_service(data: EmployeeCreate, current_user: UserPublic) -> TeamUserPublic:
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="فقط مالك الحساب يمكنه إضافة موظفين.")
    existing = await get_user_by_email(data.email)
    if existing:
        raise HTTPException(status_code=400, detail="هذا البريد مستخدم من قبل.")

    company = await get_or_create_company_for_owner(current_user.id)
    if not company.get("is_subscribed", False):
        raise HTTPException(
            status_code=403,
            detail="لا يمكنك إضافة موظفين قبل الاشتراك في إحدى الخطط. يرجى ترقية الحساب من صفحة الإعدادات.",
        )
    plan_dict = get_plan(company.get("plan_key", "starter"))
    max_users = plan_dict.get("max_users")
    if isinstance(max_users, int) and max_users > 0:
        team = await get_team_for_owner(current_user.id)
        if len(team) >= max_users:
            raise HTTPException(
                status_code=403,
                detail=f"لقد وصلت إلى الحد الأقصى لعدد المستخدمين في خطتك الحالية ({max_users} مستخدم). "
                f"يرجى ترقية الخطة لإضافة موظفين جدد.",
            )
    if len(data.password.encode("utf-8")) > 72:
        raise HTTPException(
            status_code=400,
            detail="كلمة المرور طويلة جداً، الرجاء استخدام كلمة مرور أقصر (أقل من 72 حرف/بايت).",
        )
    employee = await create_employee_user(
        owner_user_id=current_user.id,
        email=data.email,
        password_hash=get_password_hash(data.password),
        permissions=data.permissions,
        display_name=data.display_name,
        role=data.role,
    )
    created_user = TeamUserPublic(
        id=employee["id"],
        email=employee["email"],
        role=employee.get("role", "employee"),
        status=employee.get("status", "active"),
        display_name=(employee.get("display_name") or "").strip() or employee.get("email"),
        permissions=employee.get("permissions") or {},
        assigned_clients_count=0,
        assigned_properties_count=0,
    )
    await create_owner_team_notification(
        owner_id=current_user.id,
        type="team_member_added",
        category="system",
        title="إضافة موظف جديد",
        message=f"تمت إضافة {created_user.display_name or created_user.email} إلى الفريق.",
        link="/settings?section=users",
        metadata={"user_id": created_user.id},
    )
    return created_user


async def update_team_user_service(user_id: str, data: EmployeeUpdate, current_user: UserPublic) -> TeamUserPublic:
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="فقط مالك الحساب يمكنه إدارة الموظفين.")
    updates: Dict[str, object] = {}
    if data.status is not None:
        if data.status not in {"active", "disabled"}:
            raise HTTPException(status_code=400, detail="حالة المستخدم غير صحيحة.")
        updates["status"] = data.status
    if data.permissions is not None:
        updates["permissions"] = data.permissions
    if data.display_name is not None:
        updates["display_name"] = data.display_name
    if data.role is not None:
        updates["role"] = data.role
    updated = await update_employee_user(current_user.id, user_id, updates)
    if not updated:
        raise HTTPException(status_code=404, detail="الموظف غير موجود أو ليس ضمن هذه الشركة.")
    team_user = TeamUserPublic(
        id=updated["id"],
        email=updated["email"],
        role=updated.get("role", "employee"),
        status=updated.get("status", "active"),
        display_name=(updated.get("display_name") or "").strip() or updated.get("email"),
        permissions=updated.get("permissions") or {},
        assigned_clients_count=await count_assigned_clients_for_user(current_user.id, updated["id"]),
        assigned_properties_count=await count_assigned_properties_for_user(current_user.id, updated["id"]),
    )
    if data.permissions is not None:
        await create_owner_team_notification(
            owner_id=current_user.id,
            type="permissions_changed",
            category="system",
            title="تغيير صلاحيات موظف",
            message=f"تم تحديث صلاحيات {team_user.display_name or team_user.email}.",
            link="/settings?section=users",
            metadata={"user_id": team_user.id},
        )
    return team_user
