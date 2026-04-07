from fastapi import FastAPI, HTTPException, Query, Depends, UploadFile, File
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from typing import List, Optional, Dict
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
import os
import re
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
    SubdomainRequest,
    SubdomainCheckResponse,
    EmployeeCreate,
    EmployeeUpdate,
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
    company_for_plan = await get_or_create_company_for_owner(owner_id_for_plan)
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

    company = await get_or_create_company_for_owner(current_user.id)
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

    return CompanySettings(
        company_name=updated.get("company_name"),
        logo_url=updated.get("logo_url"),
        official_email=updated.get("official_email"),
        contact_phone=updated.get("contact_phone"),
        subdomain=updated.get("subdomain"),
        plan_key=updated.get("plan_key", "starter"),
        is_subscribed=updated.get("is_subscribed", False),
        subscription_started_at=updated.get("subscription_started_at"),
        subscription_ends_at=updated.get("subscription_ends_at"),
    )


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

    return CompanySettings(
        company_name=updated.get("company_name"),
        logo_url=updated.get("logo_url"),
        official_email=updated.get("official_email"),
        contact_phone=updated.get("contact_phone"),
        subdomain=updated.get("subdomain"),
        plan_key=updated.get("plan_key", "starter"),
        is_subscribed=updated.get("is_subscribed", False),
        subscription_started_at=updated.get("subscription_started_at"),
        subscription_ends_at=updated.get("subscription_ends_at"),
    )


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
    company = await get_or_create_company_for_owner(current_user.id)
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

    return CompanySettings(
        company_name=updated.get("company_name"),
        logo_url=updated.get("logo_url"),
        official_email=updated.get("official_email"),
        contact_phone=updated.get("contact_phone"),
        subdomain=updated.get("subdomain"),
        plan_key=updated.get("plan_key", "starter"),
        is_subscribed=updated.get("is_subscribed", False),
        subscription_started_at=updated.get("subscription_started_at"),
        subscription_ends_at=updated.get("subscription_ends_at"),
    )


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
    prop = await get_property_by_id(property_id)
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    return prop


@app.get("/public/companies/{owner_id}", response_model=CompanySettings)
async def get_public_company(owner_id: str):
    """
    Public endpoint to retrieve basic company information (name, logo, contact)
    for a given owner account. No authentication required.
    """
    company = await get_company_by_owner_id(owner_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

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
    )


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
        cities = await get_all_cities()
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
    user = await create_user(user_in.email, hashed, user_in.gemini_api_key)
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
    updated = await update_user_gemini_key(current_user.id, gemini_api_key)
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
    company_for_plan = await get_or_create_company_for_owner(owner_id_for_plan)
    if not company_for_plan.get("is_subscribed", False):
        raise HTTPException(
            status_code=403,
            detail="لا يمكنك إضافة عروض جديدة قبل الاشتراك في إحدى الخطط. يرجى التوجه إلى صفحة الإعدادات لاختيار خطة مناسبة.",
        )

    # Prefer the user's own Gemini key if configured; otherwise the backend default key is used.
    processed_data = process_real_estate_text(
        property_input.raw_text,
        api_key=current_user.gemini_api_key,
    )
    if not processed_data or "error" in processed_data:
        # If Gemini quota is exhausted or AI failed, fall back to a minimal property
        details = str(processed_data.get("details", ""))
        if "RESOURCE_EXHAUSTED" in details:
            # Create a basic property record so the user can still save the offer
            processed_data = {
                "city": "غير مذكور",
                "neighborhood": "غير مذكور",
                "property_type": "غير مذكور",
                "area": 0.0,
                "price": 0.0,
                "details": "تم إدخال العرض بدون تحليل آلي بسبب انتهاء حد الذكاء الاصطناعي.",
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
    await delete_properties_by_city(city)
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
    await delete_properties_by_neighborhood(city, neighborhood)
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
    cities = await get_all_cities()
    return cities

@app.get("/neighborhoods", response_model=List[str])
async def list_neighborhoods_endpoint(city: Optional[str] = None, current_user: UserPublic = Depends(get_current_user)):
    """
    Get a list of all unique neighborhoods, optionally filtered by city.
    """
    neighborhoods = await get_all_neighborhoods(city)
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

    # Try to infer city name from known cities in the DB
    try:
        cities = await get_all_cities()
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
