from pydantic import BaseModel, ConfigDict, EmailStr, Field
from typing import Optional, List
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
    # Optional: relative region within the city, inferred automatically by AI
    # Examples: "شمال", "جنوب", "شرق", "غرب", "وسط", "غير مذكور"
    region_within_city: Optional[str] = None
    # Attachments & external links
    images: List[str] = Field(default_factory=list)
    videos: List[str] = Field(default_factory=list)
    documents: List[str] = Field(default_factory=list)
    map_url: Optional[str] = None

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

