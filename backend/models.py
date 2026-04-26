from pydantic import BaseModel, ConfigDict, EmailStr, Field
from typing import Optional, List, Literal
from datetime import datetime


class PropertyInput(BaseModel):
    raw_text: str
    # Attachments & links provided directly by the user (not inferred by AI)
    images: List[str] = Field(default_factory=list)
    videos: List[str] = Field(default_factory=list)
    documents: List[str] = Field(default_factory=list)
    map_url: Optional[str] = None


class Property(BaseModel):
    # Exposed ID used by the frontend (stringified MongoDB _id)
    id: Optional[str] = None
    city: str
    neighborhood: str
    property_type: str
    area: float
    price: float
    details: Optional[str] = None
    owner_name: Optional[str] = None
    owner_contact_number: Optional[str] = None
    marketer_contact_number: Optional[str] = None
    formatted_description: Optional[str] = None
    raw_text: str
    owner_id: Optional[str] = None
    property_code: Optional[str] = None
    # Optional: relative region within the city, inferred automatically by AI
    # Examples: "شمال", "جنوب", "شرق", "غرب", "وسط", "غير مذكور"
    region_within_city: Optional[str] = None
    # Attachments & external links
    images: List[str] = Field(default_factory=list)
    videos: List[str] = Field(default_factory=list)
    documents: List[str] = Field(default_factory=list)
    map_url: Optional[str] = None
    view_count: int = 0

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
    )


class PropertyUpdate(BaseModel):
    city: Optional[str] = None
    neighborhood: Optional[str] = None
    property_type: Optional[str] = None
    area: Optional[float] = None
    price: Optional[float] = None
    details: Optional[str] = None
    owner_name: Optional[str] = None
    owner_contact_number: Optional[str] = None
    marketer_contact_number: Optional[str] = None
    formatted_description: Optional[str] = None
    region_within_city: Optional[str] = None
    images: Optional[List[str]] = None
    videos: Optional[List[str]] = None
    documents: Optional[List[str]] = None
    map_url: Optional[str] = None

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
    )


class UserBase(BaseModel):
    email: EmailStr
    gemini_api_key: Optional[str] = None


class UserCreate(UserBase):
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserPublic(UserBase):
    id: Optional[str] = None
    role: str = "owner"
    status: str = "active"
    company_owner_id: Optional[str] = None
    permissions: Optional[dict] = None

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
    )


# ===== Settings / Company / Plans models =====


class PlanInfo(BaseModel):
    key: str
    name: str
    max_users: int
    max_properties: int
    max_storage_mb: Optional[int] = None
    allow_custom_subdomain: bool
    price_monthly_sar: Optional[float] = None


class PlanUsage(BaseModel):
    plan: PlanInfo
    current_users: int
    current_properties: int
    used_storage_mb: Optional[int] = None


class CompanySettings(BaseModel):
    company_name: Optional[str] = None
    logo_url: Optional[str] = None
    official_email: Optional[str] = None
    contact_phone: Optional[str] = None
    subdomain: Optional[str] = None
    plan_key: str = "starter"
    is_subscribed: bool = False
    subscription_started_at: Optional[datetime] = None
    subscription_ends_at: Optional[datetime] = None
    billing_status: Optional[str] = None
    cancel_at_period_end: bool = False
    trial_used: bool = False


class CompanySettingsUpdate(BaseModel):
    company_name: Optional[str] = None
    logo_url: Optional[str] = None
    official_email: Optional[str] = None
    contact_phone: Optional[str] = None


class TeamUserPublic(BaseModel):
    id: str
    email: EmailStr
    role: str  # "owner" | "employee"
    status: str  # "active" | "disabled"
    permissions: Optional[dict] = None


class SettingsOverview(BaseModel):
    company: CompanySettings
    plan_usage: PlanUsage
    team: List[TeamUserPublic]


class PlanChangeRequest(BaseModel):
    plan_key: str


class CheckoutSessionRequest(BaseModel):
    plan_key: str
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None


class CheckoutSessionResponse(BaseModel):
    url: str
    session_id: Optional[str] = None


class PortalSessionResponse(BaseModel):
    url: str


class SubdomainRequest(BaseModel):
    subdomain: str


class SubdomainCheckResponse(BaseModel):
    ok: bool
    message: str


class EmployeeCreate(BaseModel):
    email: EmailStr
    password: str
    permissions: Optional[dict] = None


class EmployeeUpdate(BaseModel):
    status: Optional[str] = None  # "active" | "disabled"
    permissions: Optional[dict] = None


class PlatformStats(BaseModel):
    total_users: int
    total_owners: int
    total_employees: int
    total_offices: int
    total_properties: int
    subscribed_offices: int
    trialing_offices: int
    unsubscribed_offices: int


class PlatformPropertyMini(BaseModel):
    id: Optional[str] = None
    city: str
    neighborhood: str
    property_type: str
    area: float
    price: float
    owner_name: Optional[str] = None


class PlatformOfficeSummary(BaseModel):
    owner_user_id: str
    owner_email: Optional[str] = None
    company_name: Optional[str] = None
    plan_key: str = "starter"
    is_subscribed: bool = False
    billing_status: Optional[str] = None
    trial_used: bool = False
    subscription_started_at: Optional[datetime] = None
    subscription_ends_at: Optional[datetime] = None
    total_properties: int = 0
    total_employees: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class PlatformOfficeDetail(PlatformOfficeSummary):
    contact_phone: Optional[str] = None
    official_email: Optional[str] = None
    subdomain: Optional[str] = None
    employees: List[TeamUserPublic] = Field(default_factory=list)
    properties: List[PlatformPropertyMini] = Field(default_factory=list)


class PlatformAdminSubscriptionActionRequest(BaseModel):
    action: Literal["extend", "grant_free", "cancel"]
    days: Optional[int] = Field(default=None, ge=1, le=3650)


class PropertyInquiryCreate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    message: str


class PropertyInquiryPublic(BaseModel):
    id: str
    property_id: str
    owner_id: str
    property_title: Optional[str] = None
    city: Optional[str] = None
    neighborhood: Optional[str] = None
    name: Optional[str] = None
    phone: Optional[str] = None
    message: str
    status: str = "new"  # "new" | "responded"
    responded_at: Optional[datetime] = None
    created_at: datetime


class PropertyInquiryStatusUpdate(BaseModel):
    status: Literal["new", "responded"]


class DashboardOverview(BaseModel):
    total_properties: int
    total_views: int
    total_inquiries: int
    recent_inquiries: List[PropertyInquiryPublic] = Field(default_factory=list)

