from pydantic import BaseModel, ConfigDict, EmailStr, Field
from typing import Optional, List, Literal
from datetime import datetime


class PropertyInput(BaseModel):
    raw_text: str = ""
    input_mode: Literal["ai", "manual"] = "ai"
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
    match_level: Optional[int] = None
    match_score: Optional[int] = None

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
    display_name: Optional[str] = None
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
    role: str  # "owner" | "manager" | "employee"
    status: str  # "active" | "disabled"
    display_name: Optional[str] = None
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
    role: Literal["manager", "employee"] = "employee"
    display_name: Optional[str] = None
    permissions: Optional[dict] = None


class EmployeeUpdate(BaseModel):
    status: Optional[str] = None  # "active" | "disabled"
    role: Optional[Literal["manager", "employee"]] = None
    display_name: Optional[str] = None
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


class ClientRequestInput(BaseModel):
    raw_text: str
    follow_up_details: Optional[str] = None

    profile_id: Optional[str] = None
    client_name: Optional[str] = None
    phone_number: Optional[str] = None


class ClientRequestPublic(BaseModel):
    id: str
    owner_id: str
    raw_text: str
    client_name: str = "غير محدد"
    phone_number: Optional[str] = None
    property_type: str = "غير محدد"
    city: str = "غير محدد"
    neighborhoods: List[str] = Field(default_factory=list)
    budget_min: Optional[int] = None
    budget_max: Optional[int] = None
    area_min: Optional[int] = None
    area_max: Optional[int] = None
    additional_requirements: str = ""
    action_plan: str = ""
    reminder_type: Optional[Literal["follow_up", "viewing"]] = None
    deadline_at: Optional[datetime] = None
    reminder_before_minutes: int = 120
    reminder_sent_at: Optional[datetime] = None
    status: Literal["new", "searching", "closed"] = "new"
    # NEW: Follow-up details - what the employee will do with the client
    follow_up_details: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ClientRequestUpdate(BaseModel):
    client_name: Optional[str] = None
    phone_number: Optional[str] = None
    property_type: Optional[str] = None
    city: Optional[str] = None
    neighborhoods: Optional[List[str]] = None
    budget_min: Optional[int] = None
    budget_max: Optional[int] = None
    area_min: Optional[int] = None
    area_max: Optional[int] = None
    additional_requirements: Optional[str] = None
    action_plan: Optional[str] = None
    reminder_type: Optional[Literal["follow_up", "viewing"]] = None
    deadline_at: Optional[datetime] = None
    reminder_before_minutes: Optional[int] = Field(default=None, ge=15, le=10080)
    reminder_sent_at: Optional[datetime] = None
    status: Optional[Literal["new", "searching", "closed"]] = None
    # NEW: Follow-up details - what the employee will do with the client
    follow_up_details: Optional[str] = None


# ===== Client Request Notes =====


class ClientNoteInput(BaseModel):
    content: str
    author_name: Optional[str] = "غير محدد"
    author_role: Optional[str] = "owner"
    color: str = "#3f7d3c"


class ClientNotePublic(BaseModel):
    id: str
    request_id: str = ""  # Empty for client offer notes
    offer_id: str = ""  # Empty for client request notes
    owner_id: str
    content: str
    author_name: str = "غير محدد"
    author_role: str = "owner"
    color: str = "#3f7d3c"
    created_at: datetime


class ClientNoteUpdate(BaseModel):
    content: Optional[str] = None
    author_name: Optional[str] = None
    author_role: Optional[str] = None
    color: Optional[str] = None


# ===== Client Offers (Properties assigned to clients) =====


class ClientOfferInput(BaseModel):
    profile_id: Optional[str] = None
    client_name: str = "غير محدد"
    phone_number: Optional[str] = None
    property_id: str
    # NEW: Follow-up details - what the employee will do with the client
    follow_up_details: Optional[str] = None


class ClientOfferPublic(BaseModel):
    id: str
    owner_id: str
    profile_id: Optional[str] = None
    client_name: str = "غير محدد"
    phone_number: Optional[str] = None
    property_id: str
    status: Literal["active", "archived", "new", "working", "closed"] = "active"
    notes: str = ""
    reminder_type: Optional[Literal["follow_up", "viewing"]] = None
    deadline_at: Optional[datetime] = None
    reminder_before_minutes: int = 120
    # NEW: Follow-up details - what the employee will do with the client
    follow_up_details: Optional[str] = None
    created_at: datetime


class ClientOfferUpdate(BaseModel):
    client_name: Optional[str] = None
    phone_number: Optional[str] = None
    status: Optional[Literal["active", "archived", "new", "working", "closed"]] = None
    notes: Optional[str] = None
    reminder_type: Optional[Literal["follow_up", "viewing"]] = None
    deadline_at: Optional[datetime] = None
    reminder_before_minutes: Optional[int] = Field(default=None, ge=15, le=10080)
    # NEW: Follow-up details - what the employee will do with the client
    follow_up_details: Optional[str] = None


# ===== Client Profiles (independent from requests/offers) =====


class ClientProfileInput(BaseModel):
    client_name: str
    phone_number: Optional[str] = None
    notes: str = ""
    client_types: List[str] = Field(default_factory=list)
    assigned_user_id: Optional[str] = None
    assigned_user_name: Optional[str] = None


class ClientProfilePublic(BaseModel):
    id: str
    owner_id: str
    client_name: str
    phone_number: Optional[str] = None
    notes: str = ""
    client_types: List[str] = Field(default_factory=list)
    assigned_user_id: Optional[str] = None
    assigned_user_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ClientProfileUpdate(BaseModel):
    client_name: Optional[str] = None
    phone_number: Optional[str] = None
    notes: Optional[str] = None
    client_types: Optional[List[str]] = None
    assigned_user_id: Optional[str] = None
    assigned_user_name: Optional[str] = None


# ===== Appointments =====


class AppointmentInput(BaseModel):
    type: Literal["request", "offer"]
    client_name: str
    phone_number: Optional[str] = None
    property_type: Optional[str] = None
    city: Optional[str] = None
    neighborhood: Optional[str] = None
    property_id: Optional[str] = None
    reminder_type: Optional[Literal["follow_up", "viewing"]] = None
    deadline_at: Optional[datetime] = None
    reminder_before_minutes: int = 120
    follow_up_details: Optional[str] = None


class AppointmentPublic(BaseModel):
    id: str
    type: Literal["request", "offer"]
    client_name: str
    phone_number: Optional[str] = None
    property_type: Optional[str] = None
    city: Optional[str] = None
    neighborhood: Optional[str] = None
    property_id: Optional[str] = None
    reminder_type: Optional[Literal["follow_up", "viewing"]] = None
    deadline_at: Optional[datetime] = None
    reminder_before_minutes: int = 120
    follow_up_details: Optional[str] = None
    status: str = "active"
    created_at: datetime
    source_id: Optional[str] = None


class AppointmentUpdate(BaseModel):
    client_name: Optional[str] = None
    phone_number: Optional[str] = None
    property_type: Optional[str] = None
    city: Optional[str] = None
    neighborhood: Optional[str] = None
    property_id: Optional[str] = None
    reminder_type: Optional[Literal["follow_up", "viewing"]] = None
    deadline_at: Optional[datetime] = None
    reminder_before_minutes: Optional[int] = Field(default=None, ge=15, le=10080)
    follow_up_details: Optional[str] = None
    status: Optional[str] = None
