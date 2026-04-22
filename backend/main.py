from fastapi import FastAPI, HTTPException, Query, Depends, UploadFile, File, Request, Header
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from typing import List, Optional, Dict
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
import os
import re
import stripe
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from models import (
    PropertyInput,
    Property,
    PropertyUpdate,
    UserCreate,
    UserLogin,
    UserPublic,
    PlanInfo,
    PlanUsage,
    CompanySettings,
    CompanySettingsUpdate,
    TeamUserPublic,
    SettingsOverview,
    PlanChangeRequest,
    CheckoutSessionRequest,
    CheckoutSessionResponse,
    PortalSessionResponse,
    SubdomainRequest,
    SubdomainCheckResponse,
    EmployeeCreate,
    EmployeeUpdate,
    PlatformStats,
    PlatformOfficeSummary,
    PlatformOfficeDetail,
    PlatformAdminSubscriptionActionRequest,
    PropertyInquiryCreate,
    PropertyInquiryPublic,
    PropertyInquiryStatusUpdate,
    DashboardOverview,
)
from ai_processor import process_real_estate_text
from database import (
    add_property,
    get_properties,
    get_all_cities,
    get_all_neighborhoods,
    update_property_db,
    delete_property_db,
    delete_property_by_raw_text,
    delete_properties_by_city,
    delete_properties_by_neighborhood,
    get_user_by_email,
    get_user_by_id,
    create_user,
    update_user_gemini_key,
    get_property_by_id,
    get_or_create_company_for_owner,
    update_company_settings_db,
    set_company_plan_db,
    get_company_by_subdomain,
    set_company_subdomain_db,
    count_properties_for_owner,
    get_team_for_owner,
    create_employee_user,
    update_employee_user,
    get_company_by_owner_id,
    update_company_plan_key,
    set_company_stripe_customer_id,
    get_company_by_stripe_customer_id,
    update_company_billing_from_stripe,
    consume_company_daily_ai_quota,
    start_company_free_trial_db,
    get_platform_stats_db,
    get_platform_offices_overview_db,
    get_platform_office_detail_db,
    increment_property_view_count,
    create_property_inquiry_db,
    get_owner_inquiries_db,
    count_owner_inquiries_db,
    count_owner_total_views_db,
    update_property_inquiry_status_db,
)


# Simple normalization for Arabic city/neighborhood names to reduce duplicates
CITY_ALIASES = {
    "جده": "جدة",
    "جدة": "جدة",
    "الرياض": "الرياض",
    "رياض": "الرياض",
}


def normalize_city(name: Optional[str]) -> Optional[str]:
    if not isinstance(name, str):
        return name
    stripped = name.strip()
    return CITY_ALIASES.get(stripped, stripped)


def normalize_neighborhood(name: Optional[str]) -> Optional[str]:
    if not isinstance(name, str):
        return name
    # For now, just trim spaces; you can extend this with more aliases if needed
    return name.strip()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


app = FastAPI(
    title="Akare Real Estate AI API",
    description="API for managing and filtering real estate listings.",
    version="1.0.0",
)

# ==== Auth settings ====
SECRET_KEY = os.getenv("SECRET_KEY", "CHANGE_ME_IN_PRODUCTION")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 1 day

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

# ==== Stripe settings ====
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "").strip()
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()
FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost:5173").rstrip("/")

STRIPE_PRICE_IDS = {
    "starter": os.getenv("STRIPE_PRICE_STARTER_MONTHLY", "").strip(),
    "business": os.getenv("STRIPE_PRICE_BUSINESS_MONTHLY", "").strip(),
    "enterprise": os.getenv("STRIPE_PRICE_ENTERPRISE_MONTHLY", "").strip(),
}

PRICE_ID_TO_PLAN_KEY = {
    price_id: plan_key for plan_key, price_id in STRIPE_PRICE_IDS.items() if price_id
}

if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY

# ==== AI settings ====
try:
    AI_DAILY_ANALYSIS_LIMIT = int(os.getenv("AI_DAILY_ANALYSIS_LIMIT", "30"))
except ValueError:
    AI_DAILY_ANALYSIS_LIMIT = 30
FREE_TRIAL_PLAN_KEY = "starter"
PLATFORM_ADMIN_EMAILS = {
    email.strip().lower()
    for email in os.getenv("PLATFORM_ADMIN_EMAILS", "abadi.saeed@bynh.sa").split(",")
    if email.strip()
}


def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password):
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def require_permission(user: UserPublic, permission: str) -> None:
    """
    Ensure that the current user has a given permission.
    Owners always have all permissions.
    """
    if user.role == "owner":
        return
    perms = user.permissions or {}
    has_perm = bool(perms.get(permission))
    if not has_perm:
        # Friendly Arabic messages per permission
        if permission == "can_add_property":
            detail = "لا تملك صلاحية إضافة عروض عقارية في هذه الشركة."
        elif permission == "can_edit_property":
            detail = "لا تملك صلاحية تعديل العروض العقارية في هذه الشركة."
        elif permission == "can_delete_property":
            detail = "لا تملك صلاحية حذف العروض العقارية في هذه الشركة."
        elif permission == "can_manage_files":
            detail = "لا تملك صلاحية إدارة الملفات والمرفقات في هذه الشركة."
        else:
            detail = "لا تملك الصلاحية اللازمة لتنفيذ هذه العملية."
        raise HTTPException(status_code=403, detail=detail)


async def get_current_user(token: str = Depends(oauth2_scheme)) -> UserPublic:
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user_data = await get_user_by_id(user_id)
    if user_data is None:
        raise credentials_exception
    return UserPublic(**user_data)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded files (images / videos / docs)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

@app.get("/")
def read_root():
    return {"message": "Welcome to the Akare Real Estate AI Backend"}


# ===== Plans & Company settings (static definition for now) =====

PLANS: Dict[str, Dict] = {
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
        "price_monthly_sar": 249.0,
    },
    "enterprise": {
        "key": "enterprise",
        "name": "خطة الشركات",
        "max_users": 50,
        "max_properties": 5000,
        "max_storage_mb": 102400,
        "allow_custom_subdomain": True,
        "price_monthly_sar": 799.0,
    },
}


def get_plan(key: str) -> Dict:
    return PLANS.get(key, PLANS["starter"])


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
    """
    Auto-expire free trial when its end date is reached.
    """
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


async def can_view_company_properties(owner_user_id: Optional[str]) -> bool:
    """
    Visibility guard: hide all company listings in dashboard when subscription is inactive.
    """
    if not owner_user_id:
        return False
    company = await refresh_trial_subscription_state(owner_user_id)
    return bool(company.get("is_subscribed", False))


def require_platform_admin(current_user: UserPublic) -> None:
    email = (current_user.email or "").strip().lower()
    if email not in PLATFORM_ADMIN_EMAILS:
        raise HTTPException(status_code=403, detail="هذه الصفحة متاحة لمالك المنصة فقط.")


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


@app.get("/admin/platform-stats", response_model=PlatformStats)
async def get_platform_stats(current_user: UserPublic = Depends(get_current_user)):
    """
    Platform-wide stats for product owner/admin dashboard.
    """
    require_platform_admin(current_user)
    stats = await get_platform_stats_db()
    return PlatformStats(**stats)


@app.get("/admin/platform-offices", response_model=List[PlatformOfficeSummary])
async def get_platform_offices(current_user: UserPublic = Depends(get_current_user)):
    """
    Platform-wide offices list with per-office aggregates.
    """
    require_platform_admin(current_user)
    offices = await get_platform_offices_overview_db()
    return [PlatformOfficeSummary(**o) for o in offices]


@app.get("/admin/platform-offices/{owner_user_id}", response_model=PlatformOfficeDetail)
async def get_platform_office_detail(
    owner_user_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Full office details for platform admin.
    """
    require_platform_admin(current_user)
    detail = await get_platform_office_detail_db(owner_user_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Office not found")
    return PlatformOfficeDetail(**detail)


@app.post("/admin/platform-offices/{owner_user_id}/subscription-action", response_model=CompanySettings)
async def platform_admin_subscription_action(
    owner_user_id: str,
    data: PlatformAdminSubscriptionActionRequest,
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Platform admin can extend subscription or grant manual free period by days.
    """
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

    if data.action == "grant_free":
        next_status = "manual_free"
    else:
        current_status = (company.get("billing_status") or "").strip()
        next_status = current_status if current_status else "manual_extended"

    updated = await update_company_billing_from_stripe(
        owner_user_id,
        billing_status=next_status,
        is_subscribed=True,
        cancel_at_period_end=False,
        subscription_started_at=started_at,
        subscription_ends_at=new_end,
    )
    if not updated:
        raise HTTPException(status_code=400, detail="تعذر تحديث حالة الاشتراك.")
    return company_settings_response(updated)


def stripe_obj_to_dict(value):
    if value is None:
        return None

    if isinstance(value, dict):
        return {k: stripe_obj_to_dict(v) for k, v in value.items()}

    if isinstance(value, (list, tuple)):
        return [stripe_obj_to_dict(v) for v in value]

    # Stripe objects may expose either to_dict_recursive() or to_dict()
    for method_name in ("to_dict_recursive", "to_dict"):
        method = getattr(value, method_name, None)
        if callable(method):
            try:
                return stripe_obj_to_dict(method())
            except Exception:
                pass

    # Fallback for mapping-like objects
    items_method = getattr(value, "items", None)
    if callable(items_method):
        try:
            return {k: stripe_obj_to_dict(v) for k, v in items_method()}
        except Exception:
            pass

    return value


@app.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Simple file upload endpoint for property media (images, videos, documents).
    Saves the file under /uploads and returns a public URL.
    Requires permission to manage files for employees, and an active subscription plan.
    """
    # Enforce file management permissions (employees)
    require_permission(current_user, "can_manage_files")

    # Ensure the company has an active subscription before allowing uploads
    owner_id_for_plan = current_user.id if current_user.role == "owner" else current_user.company_owner_id
    if not owner_id_for_plan:
        raise HTTPException(
            status_code=400,
            detail="لا يمكن تحديد شركة الحساب الحالي.",
        )
    company_for_plan = await refresh_trial_subscription_state(owner_id_for_plan)
    if not company_for_plan.get("is_subscribed", False):
        raise HTTPException(
            status_code=403,
            detail="لا يمكنك رفع ملفات ومرفقات قبل الاشتراك في إحدى الخطط. يرجى ترقية الحساب من صفحة الإعدادات.",
        )
    original_name = file.filename or "file"
    # Avoid collisions by prefixing with timestamp
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S%f")
    safe_name = "".join(c for c in original_name if c.isalnum() or c in {".", "_", "-"}) or "file"
    filename = f"{timestamp}_{safe_name}"
    file_path = os.path.join(UPLOAD_DIR, filename)

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    url = f"/uploads/{filename}"
    return {"url": url}


# ===== Settings / Company endpoints =====


@app.get("/settings/overview", response_model=SettingsOverview)
async def get_settings_overview(current_user: UserPublic = Depends(get_current_user)):
    """
    Return high-level settings overview for the current account:
    - company settings
    - current plan & usage
    - team members (owner + employees, when implemented)
    """
    # Only the owner can view and manage full settings; employees could later have a limited view.
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="هذه الصفحة متاحة لمالك الحساب فقط.")

    company = await refresh_trial_subscription_state(current_user.id)
    plan_dict = get_plan(company.get("plan_key", "starter"))
    plan = PlanInfo(**plan_dict)

    # Team: owner + any employees belonging to this company
    raw_team = await get_team_for_owner(current_user.id)
    team: List[TeamUserPublic] = []
    for u in raw_team:
        team.append(
            TeamUserPublic(
                id=u["id"],
                email=u["email"],
                role=u.get("role", "owner"),
                status=u.get("status", "active"),
                permissions=u.get("permissions") or {},
            )
        )

    current_properties = await count_properties_for_owner(current_user.id)
    current_users = len(team)

    plan_usage = PlanUsage(
        plan=plan,
        current_users=current_users,
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

    return SettingsOverview(
        company=company_settings,
        plan_usage=plan_usage,
        team=team,
    )


@app.put("/settings/company", response_model=CompanySettings)
async def update_company_settings(
    settings: CompanySettingsUpdate,
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Update basic company settings (name, email, phone, logo URL).
    """
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="فقط مالك الحساب يمكنه تعديل إعدادات الشركة.")
    updates = settings.model_dump(exclude_unset=True)
    updated = await update_company_settings_db(current_user.id, updates)
    if not updated:
        # Should not normally happen because get_or_create_company_for_owner always creates one
        raise HTTPException(status_code=404, detail="Company not found")

    return company_settings_response(updated)


@app.get("/settings/plans", response_model=List[PlanInfo])
async def list_plans(current_user: UserPublic = Depends(get_current_user)):
    """
    List all available subscription plans.
    """
    return [PlanInfo(**p) for p in PLANS.values()]


@app.put("/settings/plan", response_model=PlanUsage)
async def change_plan(
    data: PlanChangeRequest,
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Change the active plan for the current company.
    """
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="فقط مالك الحساب يمكنه تغيير الخطة.")
    plan_key = data.plan_key
    if plan_key not in PLANS:
        raise HTTPException(status_code=400, detail="الخطة غير معروفة.")

    # لا نغيّر بيانات الشركة هنا؛ فقط نعيد معلومات الخطة المطلوبة لاستخدامها في الواجهة
    plan_dict = get_plan(plan_key)
    plan = PlanInfo(**plan_dict)

    # استخدام القيم الحقيقية الحالية من النظام لعرض حالة الاستخدام مع الخطة الجديدة
    current_properties = await count_properties_for_owner(current_user.id)
    team = await get_team_for_owner(current_user.id)
    current_users = len(team)

    return PlanUsage(
        plan=plan,
        current_users=current_users,
        current_properties=current_properties,
        used_storage_mb=None,
    )


@app.post("/billing/checkout-session", response_model=CheckoutSessionResponse)
async def create_checkout_session(
    data: CheckoutSessionRequest,
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Create a Stripe Checkout session for a new subscription.
    """
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


@app.post("/billing/portal-session", response_model=PortalSessionResponse)
async def create_billing_portal_session(
    return_url: Optional[str] = Query(None),
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Create a Stripe Billing Portal session for cancellation/upgrade/downgrade.
    """
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


@app.post("/billing/confirm-checkout-session", response_model=CompanySettings)
async def confirm_checkout_session(
    session_id: str = Query(..., min_length=3),
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Confirm checkout session on return from Stripe and sync company subscription state.
    Useful when webhook is delayed/unavailable in local development.
    """
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
    return company_settings_response(updated)


@app.post("/billing/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: Optional[str] = Header(None, alias="stripe-signature"),
):
    """
    Stripe webhook endpoint to sync subscription state.
    """
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
        owner_user_id = (
            metadata.get("owner_user_id")
            or data_object.get("client_reference_id")
        )
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


@app.post("/billing/activate-subscription", response_model=CompanySettings)
async def activate_subscription(
    data: PlanChangeRequest,
    current_user: UserPublic = Depends(get_current_user),
):
    """
    تفعيل الاشتراك في الخطة المحددة (بعد إتمام الدفع عبر Stripe).
    يقوم بتعيين plan_key وتحديد is_subscribed وتواريخ بداية ونهاية الاشتراك.
    """
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="فقط مالك الحساب يمكنه تفعيل الاشتراك.")
    plan_key = data.plan_key
    if plan_key not in PLANS:
        raise HTTPException(status_code=400, detail="الخطة غير معروفة.")

    updated = await set_company_plan_db(current_user.id, plan_key)
    if not updated:
        raise HTTPException(status_code=404, detail="Company not found")

    return company_settings_response(updated)


@app.post("/billing/start-free-trial", response_model=CompanySettings)
async def start_free_trial(
    data: PlanChangeRequest,
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Activate a one-time free trial (30 days) without payment.
    """
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
    return company_settings_response(updated)


@app.post("/settings/subdomain/check", response_model=SubdomainCheckResponse)
async def check_subdomain(
    data: SubdomainRequest,
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Validate a requested subdomain for format, reserved words, and availability.
    """
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
        return SubdomainCheckResponse(
            ok=False,
            message="هذا الاسم محجوز ولا يمكن استخدامه.",
        )

    existing = await get_company_by_subdomain(value)
    if existing and existing.get("owner_user_id") != current_user.id:
        return SubdomainCheckResponse(
            ok=False,
            message="هذا السب دومين مستخدم من شركة أخرى.",
        )

    return SubdomainCheckResponse(ok=True, message="السب دومين متاح للاستخدام.")


@app.put("/settings/subdomain", response_model=CompanySettings)
async def update_subdomain(
    data: SubdomainRequest,
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Persist a validated subdomain for the current company.
    Requires a plan that allows custom subdomains.
    """
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="فقط مالك الحساب يمكنه إدارة السب دومين.")
    company = await refresh_trial_subscription_state(current_user.id)
    plan_dict = get_plan(company.get("plan_key", "starter"))

    if not plan_dict.get("allow_custom_subdomain", False):
        raise HTTPException(
            status_code=403,
            detail="خطة الاشتراك الحالية لا تسمح باستخدام سب دومين مخصص. يرجى الترقية أولاً.",
        )

    # Reuse the same checks from /settings/subdomain/check
    check_result = await check_subdomain(data, current_user)  # type: ignore[arg-type]
    if not check_result.ok:
        raise HTTPException(status_code=400, detail=check_result.message)

    updated = await set_company_subdomain_db(current_user.id, data.subdomain.strip().lower())
    if not updated:
        raise HTTPException(status_code=404, detail="Company not found")

    return company_settings_response(updated)


@app.get("/settings/team/users", response_model=List[TeamUserPublic])
async def list_team_users(current_user: UserPublic = Depends(get_current_user)):
    """
    List all users (owner + employees) that belong to the current company.
    """
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="فقط مالك الحساب يمكنه إدارة المستخدمين.")
    raw_team = await get_team_for_owner(current_user.id)
    team: List[TeamUserPublic] = []
    for u in raw_team:
        team.append(
            TeamUserPublic(
                id=u["id"],
                email=u["email"],
                role=u.get("role", "owner"),
                status=u.get("status", "active"),
                permissions=u.get("permissions") or {},
            )
        )
    return team


@app.post("/settings/team/users", response_model=TeamUserPublic)
async def create_team_user(
    data: EmployeeCreate,
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Create a new employee under the current owner's company.
    """
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="فقط مالك الحساب يمكنه إضافة موظفين.")

    existing = await get_user_by_email(data.email)
    if existing:
        raise HTTPException(status_code=400, detail="هذا البريد مستخدم من قبل.")

    # Enforce that the company has an active subscription and respect plan limits
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

    # Reuse same password validations as registration
    if len(data.password.encode("utf-8")) > 72:
        raise HTTPException(
            status_code=400,
            detail="كلمة المرور طويلة جداً، الرجاء استخدام كلمة مرور أقصر (أقل من 72 حرف/بايت).",
        )

    hashed = get_password_hash(data.password)
    employee = await create_employee_user(
        owner_user_id=current_user.id,
        email=data.email,
        password_hash=hashed,
        permissions=data.permissions,
    )
    return TeamUserPublic(
        id=employee["id"],
        email=employee["email"],
        role=employee.get("role", "employee"),
        status=employee.get("status", "active"),
        permissions=employee.get("permissions") or {},
    )


@app.put("/settings/team/users/{user_id}", response_model=TeamUserPublic)
async def update_team_user(
    user_id: str,
    data: EmployeeUpdate,
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Update an existing employee (status / permissions). Owners cannot be updated here.
    """
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="فقط مالك الحساب يمكنه إدارة الموظفين.")

    updates: Dict[str, object] = {}
    if data.status is not None:
        if data.status not in {"active", "disabled"}:
            raise HTTPException(status_code=400, detail="حالة المستخدم غير صحيحة.")
        updates["status"] = data.status
    if data.permissions is not None:
        updates["permissions"] = data.permissions

    updated = await update_employee_user(current_user.id, user_id, updates)
    if not updated:
        raise HTTPException(status_code=404, detail="الموظف غير موجود أو ليس ضمن هذه الشركة.")

    return TeamUserPublic(
        id=updated["id"],
        email=updated["email"],
        role=updated.get("role", "employee"),
        status=updated.get("status", "active"),
        permissions=updated.get("permissions") or {},
    )


@app.get("/public/properties/{property_id}", response_model=Property)
async def get_public_property(property_id: str):
    """
    Public read-only endpoint to view a single property by ID.
    No authentication required, used for share links.
    """
    prop = await increment_property_view_count(property_id)
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    return prop


@app.post("/public/properties/{property_id}/inquiries", response_model=PropertyInquiryPublic)
async def create_public_property_inquiry(property_id: str, payload: PropertyInquiryCreate):
    """
    Public endpoint: buyer can send inquiry for a property.
    """
    prop = await get_property_by_id(property_id)
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    owner_id = prop.get("owner_id")
    if not owner_id:
        raise HTTPException(status_code=400, detail="لا يمكن إرسال استفسار لهذا العرض.")

    message_text = (payload.message or "").strip()
    if not message_text:
        raise HTTPException(status_code=400, detail="الرجاء كتابة نص الاستفسار.")

    inquiry = await create_property_inquiry_db(
        property_id=property_id,
        owner_id=owner_id,
        property_title=f"{prop.get('property_type', 'عقار')} في {prop.get('neighborhood', 'غير مذكور')}",
        city=prop.get("city"),
        neighborhood=prop.get("neighborhood"),
        name=(payload.name or "").strip() or None,
        phone=(payload.phone or "").strip() or None,
        message=message_text,
    )
    return PropertyInquiryPublic(**inquiry)


@app.get("/dashboard/overview", response_model=DashboardOverview)
async def get_dashboard_overview(current_user: UserPublic = Depends(get_current_user)):
    """
    Owner/employee dashboard overview with real totals.
    """
    owner_id = current_user.id if current_user.role == "owner" else current_user.company_owner_id
    if not owner_id:
        return DashboardOverview(total_properties=0, total_views=0, total_inquiries=0, recent_inquiries=[])

    if not await can_view_company_properties(owner_id):
        return DashboardOverview(total_properties=0, total_views=0, total_inquiries=0, recent_inquiries=[])

    total_properties = await count_properties_for_owner(owner_id)
    total_views = await count_owner_total_views_db(owner_id)
    total_inquiries = await count_owner_inquiries_db(owner_id)
    recent_raw = await get_owner_inquiries_db(owner_id, limit=20)
    recent = [PropertyInquiryPublic(**r) for r in recent_raw]

    return DashboardOverview(
        total_properties=total_properties,
        total_views=total_views,
        total_inquiries=total_inquiries,
        recent_inquiries=recent,
    )


@app.put("/dashboard/inquiries/{inquiry_id}/status", response_model=PropertyInquiryPublic)
async def update_dashboard_inquiry_status(
    inquiry_id: str,
    payload: PropertyInquiryStatusUpdate,
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Owner can mark inquiry as responded/new.
    """
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="فقط مالك الحساب يمكنه تحديث حالة الاستفسارات.")
    updated = await update_property_inquiry_status_db(current_user.id, inquiry_id, payload.status)
    if not updated:
        raise HTTPException(status_code=404, detail="الاستفسار غير موجود.")
    return PropertyInquiryPublic(**updated)


@app.get("/public/companies/{owner_id}", response_model=CompanySettings)
async def get_public_company(owner_id: str):
    """
    Public endpoint to retrieve basic company information (name, logo, contact)
    for a given owner account. No authentication required.
    """
    company = await get_company_by_owner_id(owner_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    return company_settings_response(company)


@app.get("/public/companies/{owner_id}/properties", response_model=List[Property])
async def list_public_company_properties(owner_id: str):
    """
    Public endpoint to list all properties that belong to a specific office/company.
    No authentication required, used by buyers to see all listings for a marketer.
    """
    query = {"owner_id": owner_id}
    props = await get_properties(query)
    return props


@app.get("/public/companies/{owner_id}/ai-search", response_model=List[Property])
async def public_company_ai_search(
    owner_id: str,
    q: str = Query(..., min_length=3),
):
    """
    Public smart search scoped to a specific office/company, without external AI.
    Uses heuristic parsing (city, type, area) plus classic text search.
    """
    text = q.strip()
    query: dict = {"owner_id": owner_id}

    # Try to infer city name from known cities in the DB
    try:
        cities = await get_all_cities(owner_id)
    except Exception:
        cities = []

    if isinstance(cities, list):
        for c in cities:
            if isinstance(c, str) and c and c in text:
                query["city"] = normalize_city(c)
                break

    # Infer property_type from common Arabic keywords
    if "أرض" in text or "ارض" in text:
        query["property_type"] = {"$regex": "أرض", "$options": "i"}
    elif "فيلا" in text or "فيلا" in text:
        query["property_type"] = "فيلا"
    elif "عمارة" in text or "عماره" in text:
        query["property_type"] = "عمارة"

    # Infer area (one number followed by متر/م)
    m = re.search(r"(\\d+)\\s*(متر|م)", text)
    if m:
        area = float(m.group(1))
        query["area"] = {"$gte": area * 0.8, "$lte": area * 1.2}

    properties = await get_properties(query)
    if properties:
        return properties

    # Final fallback: simple text search within this owner's listings
    search_query = {
        "owner_id": owner_id,
        "$or": [
            {"city": {"$regex": q, "$options": "i"}},
            {"neighborhood": {"$regex": q, "$options": "i"}},
            {"details": {"$regex": q, "$options": "i"}},
            {"owner_name": {"$regex": q, "$options": "i"}},
            {"owner_contact_number": {"$regex": q, "$options": "i"}},
            {"marketer_contact_number": {"$regex": q, "$options": "i"}},
            {"raw_text": {"$regex": q, "$options": "i"}},
        ],
    }
    return await get_properties(search_query)


# ==== Auth endpoints ====

@app.post("/auth/register", response_model=UserPublic)
async def register_user(user_in: UserCreate):
    existing = await get_user_by_email(user_in.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    # bcrypt (المستخدمة داخل passlib) لا تقبل كلمات مرور أطول من 72 بايت
    # لذلك نتحقق هنا ونعيد رسالة واضحة للمستخدم بدل خطأ داخلي 500
    if len(user_in.password.encode("utf-8")) > 72:
        raise HTTPException(
            status_code=400,
            detail="كلمة المرور طويلة جداً، الرجاء استخدام كلمة مرور أقصر (أقل من 72 حرف/بايت).",
        )

    hashed = get_password_hash(user_in.password)
    # Registration always uses platform AI key; per-user key is ignored.
    user = await create_user(user_in.email, hashed, None)
    return UserPublic(**user)


@app.post("/auth/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    # OAuth2PasswordRequestForm gives us form fields: username, password
    user = await get_user_by_email(form_data.username)
    if not user:
        raise HTTPException(status_code=400, detail="Incorrect email or password")

    # Need the raw user doc with password_hash; fetch again bypassing helper
    # (simpler: just fetch directly from Motor here)
    # For now, we re-query using database.user_collection via get_user_by_email + an extra call
    from database import user_collection  # local import to avoid circular
    db_user = await user_collection.find_one({"email": form_data.username})
    if not db_user or not verify_password(form_data.password, db_user.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="Incorrect email or password")

    access_token = create_access_token(data={"sub": str(db_user["_id"])})
    return {"access_token": access_token, "token_type": "bearer"}


@app.get("/me", response_model=UserPublic)
async def read_me(current_user: UserPublic = Depends(get_current_user)):
    return current_user


@app.put("/me/gemini-key", response_model=UserPublic)
async def update_my_gemini_key(
    gemini_api_key: Optional[str] = Query(None),
    current_user: UserPublic = Depends(get_current_user),
):
    # Enforce platform-wide shared key: per-user keys are disabled.
    _ = gemini_api_key
    updated = await update_user_gemini_key(current_user.id, None)
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")
    return UserPublic(**updated)

@app.post("/properties", response_model=Property, status_code=201)
async def create_property_endpoint(
    property_input: PropertyInput,
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Receives raw real estate text, processes it with AI to extract details,
    saves it to the database, and returns the created property.
    """
    # Enforce permissions: employees must have can_add_property
    require_permission(current_user, "can_add_property")
    # Ensure the company has an active subscription plan before allowing new properties
    # For employees, we check the owner's company subscription.
    owner_id_for_plan = current_user.id if current_user.role == "owner" else current_user.company_owner_id
    if not owner_id_for_plan:
        raise HTTPException(
            status_code=400,
            detail="لا يمكن تحديد شركة الحساب الحالي.",
        )
    company_for_plan = await refresh_trial_subscription_state(owner_id_for_plan)
    if not company_for_plan.get("is_subscribed", False):
        raise HTTPException(
            status_code=403,
            detail="لا يمكنك إضافة عروض جديدة قبل الاشتراك في إحدى الخطط. يرجى التوجه إلى صفحة الإعدادات لاختيار خطة مناسبة.",
        )

    # Enforce daily AI limit per company (owner account for employees).
    quota = await consume_company_daily_ai_quota(owner_id_for_plan, AI_DAILY_ANALYSIS_LIMIT)
    if not quota.get("allowed"):
        raise HTTPException(
            status_code=429,
            detail=(
                f"تم تجاوز الحد اليومي لتحليل الذكاء الاصطناعي ({quota.get('limit')} تحليل/يوم) "
                "لهذا الحساب. حاول مرة أخرى غدًا."
            ),
        )

    # Use platform-level Gemini key only (per-user key is disabled).
    processed_data = process_real_estate_text(
        property_input.raw_text,
        api_key=None,
    )
    if not processed_data or "error" in processed_data:
        # If Gemini quota is exhausted, key is blocked, or AI fails, fall back to a minimal property
        details = str(processed_data.get("details", ""))
        if (
            "RESOURCE_EXHAUSTED" in details
            or "PERMISSION_DENIED" in details
            or "reported as leaked" in details
            or "UNAVAILABLE" in details
            or "503" in details
            or "high demand" in details
        ):
            # Create a basic property record so the user can still save the offer
            processed_data = {
                "city": "غير مذكور",
                "neighborhood": "غير مذكور",
                "property_type": "غير مذكور",
                "area": 0.0,
                "price": 0.0,
                "details": "تم إدخال العرض بدون تحليل آلي بسبب مشكلة مؤقتة في خدمة الذكاء الاصطناعي.",
                "owner_name": "غير مذكور",
                "owner_contact_number": "غير مذكور",
                "marketer_contact_number": "غير مذكور",
                "formatted_description": "عرض عقاري بدون وصف آلي، الرجاء مراجعة النص الأصلي يدويًا.",
                "region_within_city": "غير مذكور",
            }
        else:
            raise HTTPException(
                status_code=422,
                detail=f"Could not process text with AI. Error: {processed_data.get('details')}",
            )
    processed_data["raw_text"] = property_input.raw_text

    # Attach any user-provided media/links directly to the processed data
    processed_data["images"] = property_input.images or []
    processed_data["videos"] = property_input.videos or []
    processed_data["documents"] = property_input.documents or []
    processed_data["map_url"] = property_input.map_url

    # Normalize numeric fields that the AI might return as null or strings
    # to avoid Pydantic validation errors for required float fields.
    for numeric_field in ("area", "price"):
        value = processed_data.get(numeric_field)
        if value is None:
            # Fallback to 0.0 when the AI couldn't extract a number
            processed_data[numeric_field] = 0.0
        else:
            try:
                processed_data[numeric_field] = float(value)
            except (TypeError, ValueError):
                processed_data[numeric_field] = 0.0

    # Ensure missing text fields are filled with a friendly placeholder
    for text_field in (
        "city",
        "neighborhood",
        "property_type",
        "details",
        "owner_name",
        "owner_contact_number",
        "marketer_contact_number",
        "formatted_description",
    ):
        value = processed_data.get(text_field)
        if value is None or (isinstance(value, str) and not value.strip()):
            processed_data[text_field] = "غير مذكور"

    # Normalize location names to reduce duplicates like "جده" vs "جدة"
    processed_data["city"] = normalize_city(processed_data.get("city"))
    processed_data["neighborhood"] = normalize_neighborhood(processed_data.get("neighborhood"))
    try:
        property_data = Property(**processed_data)
    except Exception as e:
        # Surface a cleaner error instead of raw Pydantic internals
        raise HTTPException(
            status_code=400,
            detail="AI returned invalid data for the property fields; please try rephrasing the text."
        ) from e

    # Determine the owner id for this property (owner account id)
    owner_id = current_user.id
    if current_user.role != "owner":
        # For employees, we save properties under the company owner id
        if not current_user.company_owner_id:
            raise HTTPException(
                status_code=400,
                detail="لا يمكن تحديد مالك الشركة لهذا المستخدم.",
            )
        owner_id = current_user.company_owner_id

    # Enforce plan limits on number of properties before saving
    company = await get_or_create_company_for_owner(owner_id)
    plan_dict = get_plan(company.get("plan_key", "starter"))
    max_properties = plan_dict.get("max_properties")
    if isinstance(max_properties, int) and max_properties > 0:
        current_count = await count_properties_for_owner(owner_id)
        if current_count >= max_properties:
            raise HTTPException(
                status_code=403,
                detail=f"لقد وصلت إلى الحد الأقصى لعدد العروض في خطتك الحالية ({max_properties} عرض). "
                f"يرجى ترقية الخطة لإضافة عروض جديدة.",
            )

    new_property = await add_property(property_data, owner_id)
    return new_property


@app.put("/properties/{property_id}", response_model=Property)
async def update_property_endpoint(
    property_id: str,
    updates: PropertyUpdate,
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Update an existing property. Any missing text fields will be filled with 'غير مذكور'.
    Employees must have can_edit_property and can only edit properties
    that belong to their company.
    """
    # Enforce permissions for employees
    require_permission(current_user, "can_edit_property")

    # Ensure the property belongs to the same owner/company
    existing = await get_property_by_id(property_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Property not found")

    owner_id_for_user = current_user.id if current_user.role == "owner" else current_user.company_owner_id
    if not owner_id_for_user or existing.get("owner_id") != owner_id_for_user:
        # Hide existence details from users outside the company
        raise HTTPException(status_code=404, detail="Property not found")
    update_data = updates.model_dump(exclude_unset=True)

    # Normalize numeric fields if present
    for numeric_field in ("area", "price"):
        if numeric_field in update_data:
            value = update_data.get(numeric_field)
            if value is None:
                update_data[numeric_field] = 0.0
            else:
                try:
                    update_data[numeric_field] = float(value)
                except (TypeError, ValueError):
                    update_data[numeric_field] = 0.0

    # Ensure missing/empty text fields become a friendly placeholder
    for text_field in (
        "city",
        "neighborhood",
        "property_type",
        "details",
        "owner_name",
        "owner_contact_number",
        "marketer_contact_number",
        "formatted_description",
    ):
        if text_field in update_data:
            value = update_data.get(text_field)
            if value is None or (isinstance(value, str) and not value.strip()):
                update_data[text_field] = "غير مذكور"

    # Normalize location names on update as well
    if "city" in update_data:
        update_data["city"] = normalize_city(update_data.get("city"))
    if "neighborhood" in update_data:
        update_data["neighborhood"] = normalize_neighborhood(update_data.get("neighborhood"))

    updated = await update_property_db(property_id, update_data)
    if not updated:
        raise HTTPException(status_code=404, detail="Property not found")
    return updated


@app.delete("/properties/id/{property_id}", status_code=204)
async def delete_property_endpoint(
    property_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Delete a property by ID.
    Employees must have can_delete_property and can only delete properties
    that belong to their company.
    """
    # Enforce permissions for employees
    require_permission(current_user, "can_delete_property")

    existing = await get_property_by_id(property_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Property not found")

    owner_id_for_user = current_user.id if current_user.role == "owner" else current_user.company_owner_id
    if not owner_id_for_user or existing.get("owner_id") != owner_id_for_user:
        raise HTTPException(status_code=404, detail="Property not found")

    deleted = await delete_property_db(property_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Property not found")
    return None


@app.delete("/properties/by-raw-text", status_code=204)
async def delete_property_by_raw_text_endpoint(
    raw_text: str = Query(..., min_length=1),
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Delete a property by its raw_text. This is mainly used to delete legacy
    documents that don't have a valid ObjectId associated with them on the client.
    Restricted to account owner.
    """
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="فقط مالك الحساب يمكنه استخدام هذا النوع من الحذف.")
    deleted = await delete_property_by_raw_text(raw_text)
    if not deleted:
        raise HTTPException(status_code=404, detail="Property not found")
    return None


@app.delete("/properties/by-city", status_code=204)
async def delete_properties_by_city_endpoint(
    city: str = Query(..., min_length=1),
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Delete all properties under a specific city.
    Restricted to account owner.
    """
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="فقط مالك الحساب يمكنه حذف جميع العروض في مدينة.")
    # Even if nothing is deleted, we silently succeed to simplify UX when cleaning the tree
    await delete_properties_by_city(city, current_user.id)
    return None


@app.delete("/properties/by-neighborhood", status_code=204)
async def delete_properties_by_neighborhood_endpoint(
    neighborhood: str = Query(..., min_length=1),
    city: Optional[str] = Query(None),
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Delete all properties under a specific neighborhood.
    Optionally narrowed by city.
    Restricted to account owner.
    """
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="فقط مالك الحساب يمكنه حذف جميع العروض في حي.")
    # Even if nothing is deleted, we silently succeed to simplify UX when cleaning the tree
    await delete_properties_by_neighborhood(city, neighborhood, current_user.id)
    return None

@app.get("/properties", response_model=List[Property])
async def list_properties_endpoint(
    city: Optional[str] = None,
    neighborhood: Optional[str] = None,
    property_type: Optional[str] = None,
    min_area: Optional[float] = None,
    max_area: Optional[float] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    current_user: UserPublic = Depends(get_current_user),
):
    """
    List properties with advanced filtering.
    """
    # Owner sees all properties for his company; employee sees same company properties
    owner_id = current_user.id if current_user.role == "owner" else current_user.company_owner_id
    if not await can_view_company_properties(owner_id):
        return []
    query = {"owner_id": owner_id}
    if city:
        query["city"] = city
    if neighborhood:
        query["neighborhood"] = neighborhood
    if property_type:
        query["property_type"] = property_type
    if min_area is not None or max_area is not None:
        query["area"] = {}
        if min_area is not None:
            query["area"]["$gte"] = min_area
        if max_area is not None:
            query["area"]["$lte"] = max_area
    if min_price is not None or max_price is not None:
        query["price"] = {}
        if min_price is not None:
            query["price"]["$gte"] = min_price
        if max_price is not None:
            query["price"]["$lte"] = max_price
            
    properties = await get_properties(query)
    return properties

@app.get("/cities", response_model=List[str])
async def list_cities_endpoint(current_user: UserPublic = Depends(get_current_user)):
    """
    Get a list of all unique cities.
    """
    owner_id = current_user.id if current_user.role == "owner" else current_user.company_owner_id
    if not await can_view_company_properties(owner_id):
        return []
    cities = await get_all_cities(owner_id)
    return cities

@app.get("/neighborhoods", response_model=List[str])
async def list_neighborhoods_endpoint(city: Optional[str] = None, current_user: UserPublic = Depends(get_current_user)):
    """
    Get a list of all unique neighborhoods, optionally filtered by city.
    """
    owner_id = current_user.id if current_user.role == "owner" else current_user.company_owner_id
    if not await can_view_company_properties(owner_id):
        return []
    neighborhoods = await get_all_neighborhoods(owner_id, city)
    return neighborhoods

@app.get("/search", response_model=List[Property])
async def search_properties_endpoint(
    q: str = Query(..., min_length=1),
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Unified search for properties by a keyword.
    Searches in city, neighborhood, details, and raw_text.
    """
    search_query = {
        "$or": [
            {"city": {"$regex": q, "$options": "i"}},
            {"neighborhood": {"$regex": q, "$options": "i"}},
            {"details": {"$regex": q, "$options": "i"}},
            {"owner_name": {"$regex": q, "$options": "i"}},
            {"owner_contact_number": {"$regex": q, "$options": "i"}},
            {"marketer_contact_number": {"$regex": q, "$options": "i"}},
            # Backwards compatibility with legacy contact_number field
            {"contact_number": {"$regex": q, "$options": "i"}},
            {"raw_text": {"$regex": q, "$options": "i"}},
        ]
    }
    owner_id = current_user.id if current_user.role == "owner" else current_user.company_owner_id
    if not await can_view_company_properties(owner_id):
        return []
    search_query["owner_id"] = owner_id
    properties = await get_properties(search_query)
    return properties


@app.get("/ai-search", response_model=List[Property])
async def ai_search_properties_endpoint(
    q: str = Query(..., min_length=3),
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Smart heuristic search (without external AI) for a free-text Arabic buyer request.
    Tries to infer city, property type, and area from the text, then falls back to
    classic text search if needed.
    """
    text = q.strip()
    query: dict = {}
    owner_id_for_user = current_user.id if current_user.role == "owner" else current_user.company_owner_id
    if not await can_view_company_properties(owner_id_for_user):
        return []

    # Try to infer city name from known cities in the DB
    try:
        if not owner_id_for_user:
            cities = []
        else:
            cities = await get_all_cities(owner_id_for_user)
    except Exception:
        cities = []

    if isinstance(cities, list):
        for c in cities:
            if isinstance(c, str) and c and c in text:
                # Normalize the city using the same helper used elsewhere
                query["city"] = normalize_city(c)
                break

    # Infer property_type from common Arabic keywords
    if "أرض" in text or "ارض" in text:
        # Match any land types that contain the word "أرض"
        query["property_type"] = {"$regex": "أرض", "$options": "i"}
    elif "فيلا" in text or "فيلا" in text:
        query["property_type"] = "فيلا"
    elif "عمارة" in text or "عماره" in text:
        query["property_type"] = "عمارة"

    # Infer area (one number followed by متر/م)
    m = re.search(r"(\\d+)\\s*(متر|م)", text)
    if m:
        area = float(m.group(1))
        query["area"] = {"$gte": area * 0.8, "$lte": area * 1.2}

    # Always scope by user / company
    if query:
        owner_id = current_user.id if current_user.role == "owner" else current_user.company_owner_id
        query["owner_id"] = owner_id
        properties = await get_properties(query)
        if properties:
            return properties

    # Final fallback: classic text search (must pass current_user explicitly)
    return await search_properties_endpoint(q, current_user)
