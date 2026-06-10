import os
import re
import secrets
from collections import defaultdict
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from urllib.parse import urlparse
from dotenv import load_dotenv
import motor.motor_asyncio
from bson import ObjectId
from bson.errors import InvalidId
from pymongo import ReturnDocument
from models import Property, UserPublic
from services.subscription_state import derive_subscription_snapshot
from utils.permissions import (
    DEFAULT_EMPLOYEE_PERMISSIONS,
    MANAGER_DEFAULT_PERMISSIONS,
    normalize_permissions,
)

load_dotenv()

MONGO_DETAILS = os.getenv("MONGO_DETAILS")
if not MONGO_DETAILS:
    raise ValueError("MONGO_DETAILS not found in .env file. Please add it.")

client = motor.motor_asyncio.AsyncIOMotorClient(MONGO_DETAILS)
database = client.akare
property_collection = database.get_collection("properties")
user_collection = database.get_collection("users")
company_collection = database.get_collection("companies")
inquiry_collection = database.get_collection("property_inquiries")
client_request_collection = database.get_collection("client_requests")
client_request_notes_collection = database.get_collection("client_request_notes")
client_offer_collection = database.get_collection("client_offers")
notification_queue_collection = database.get_collection("notification_queue")
client_profile_collection = database.get_collection("client_profiles")
marketing_lead_collection = database.get_collection("marketing_leads")
marketing_event_collection = database.get_collection("marketing_events")
notification_collection = database.get_collection("notifications")
PROPERTY_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"

# Helper to convert document from DB
def _normalize_media_value(value: Any) -> Optional[str]:
    if isinstance(value, dict):
        # Backward compatibility for legacy shapes like { url: "...", ... }
        value = value.get("url") or value.get("path")
    if not isinstance(value, str):
        return None
    text = value.strip().replace("\\", "/")
    if not text:
        return None
    if text.startswith("/uploads/"):
        return text
    if text.startswith("uploads/"):
        return f"/{text}"
    if text.startswith("http://") or text.startswith("https://"):
        try:
            parsed = urlparse(text)
            if parsed.path.startswith("/uploads/"):
                return parsed.path
        except Exception:
            return text
        return text
    if "/uploads/" in text:
        return text[text.find("/uploads/") :]
    # Legacy fallback: plain filename saved without folder
    if "/" not in text:
        return f"/uploads/{text}"
    return text if text.startswith("/") else f"/{text}"


def _normalize_media_list(values: Any) -> List[str]:
    if not isinstance(values, list):
        return []
    normalized: List[str] = []
    for value in values:
        item = _normalize_media_value(value)
        if item:
            normalized.append(item)
    return normalized


def _fallback_property_code(_id: Any) -> Optional[str]:
    """
    Deterministic fallback code for old records that don't have property_code.
    """
    if _id is None:
        return None
    text = str(_id).strip()
    if len(text) < 6:
        return text.upper() if text else None
    return text[-6:].upper()


async def _generate_unique_property_code(length: int = 6) -> str:
    """
    Create a short unique code for each property.
    Uses readable chars only (no confusing 0/O and 1/I).
    """
    while True:
        code = "".join(secrets.choice(PROPERTY_CODE_ALPHABET) for _ in range(length))
        exists = await property_collection.find_one({"property_code": code}, {"_id": 1})
        if not exists:
            return code


def property_helper(property) -> dict:
    # Safely handle documents that might have a null _id (from older buggy inserts)
    _id = property.get("_id")
    return {
        "id": str(_id) if _id is not None else None,
        "city": property["city"],
        "neighborhood": property["neighborhood"],
        "property_type": property["property_type"],
        "area": property["area"],
        "price": property["price"],
        "details": property.get("details"),
        "owner_name": property.get("owner_name"),
        # Backwards compatible: if new fields missing, fall back to legacy contact_number
        "owner_contact_number": property.get("owner_contact_number") or property.get("contact_number"),
        "marketer_contact_number": property.get("marketer_contact_number"),
        "formatted_description": property.get("formatted_description"),
        "raw_text": property["raw_text"],
        "owner_id": property.get("owner_id"),
        "property_code": property.get("property_code") or _fallback_property_code(_id),
        "region_within_city": property.get("region_within_city"),
        "images": _normalize_media_list(property.get("images", [])),
        "videos": _normalize_media_list(property.get("videos", [])),
        "documents": _normalize_media_list(property.get("documents", [])),
        "map_url": property.get("map_url"),
        "view_count": int(property.get("view_count", 0) or 0),
        "landing_form_enabled": bool(property.get("landing_form_enabled", True)),
        "landing_primary_cta": property.get("landing_primary_cta", "whatsapp"),
    }

async def add_property(
    property_data: Property,
    owner_id: str,
    *,
    created_by_user_id: Optional[str] = None,
) -> dict:
    """
    Add a new property to the database.
    """
    # Exclude None values so that `_id` is not sent as null and MongoDB
    # can generate a proper ObjectId automatically.
    property_dict = property_data.model_dump(by_alias=True, exclude_none=True)
    property_dict["owner_id"] = owner_id
    if created_by_user_id:
        property_dict["created_by_user_id"] = created_by_user_id
    if not property_dict.get("property_code"):
        property_dict["property_code"] = await _generate_unique_property_code()
    property_dict.setdefault("view_count", 0)
    property_dict.setdefault("created_at", datetime.utcnow())
    result = await property_collection.insert_one(property_dict)
    new_property = await property_collection.find_one({"_id": result.inserted_id})
    return property_helper(new_property)


async def update_property_db(property_id: str, updates: dict) -> Optional[dict]:
    """
    Update an existing property and return the updated document.
    """
    try:
        oid = ObjectId(property_id)
    except InvalidId:
        return None

    if not updates:
        existing = await property_collection.find_one({"_id": oid})
        return property_helper(existing) if existing else None

    updated = await property_collection.find_one_and_update(
        {"_id": oid},
        {"$set": updates},
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        return None
    return property_helper(updated)


async def delete_property_db(property_id: str) -> bool:
    """
    Delete a property by its ObjectId. Returns True if a document was deleted.
    """
    try:
        oid = ObjectId(property_id)
    except InvalidId:
        return False

    result = await property_collection.delete_one({"_id": oid})
    return result.deleted_count == 1


async def delete_property_by_raw_text(raw_text: str, owner_id: str) -> bool:
    """
    Fallback delete for legacy documents that may not have a valid ObjectId.
    Deletes a single document matching the given raw_text within the owner's scope.
    """
    result = await property_collection.delete_one({"raw_text": raw_text, "owner_id": owner_id})
    return result.deleted_count == 1


async def delete_properties_by_city(city: str, owner_id: str) -> int:
    """
    Delete all properties that belong to a given city.
    Returns the number of deleted documents.
    """
    result = await property_collection.delete_many({"city": city, "owner_id": owner_id})
    return result.deleted_count


async def delete_properties_by_neighborhood(city: Optional[str], neighborhood: str, owner_id: str) -> int:
    """
    Delete all properties that belong to a given neighborhood.
    If city is provided, it will be used to narrow down the deletion.
    Returns the number of deleted documents.
    """
    query: dict = {"neighborhood": neighborhood, "owner_id": owner_id}
    if city:
        query["city"] = city
    result = await property_collection.delete_many(query)
    return result.deleted_count


async def count_properties_for_owner(owner_id: str) -> int:
    """
    Count all properties that belong to a specific owner.
    """
    return await property_collection.count_documents({"owner_id": owner_id})

async def get_properties(query: dict, limit: int = 100) -> List[dict]:
    """
    Retrieve a list of properties matching a query.
    """
    properties = []
    async for prop in property_collection.find(query).sort("_id", -1).limit(limit):
        properties.append(property_helper(prop))
    return properties


async def get_property_by_id(property_id: str) -> Optional[dict]:
    """
    Retrieve a single property by its ObjectId.
    """
    try:
        oid = ObjectId(property_id)
    except InvalidId:
        return None
    prop = await property_collection.find_one({"_id": oid})
    return property_helper(prop) if prop else None


async def increment_property_view_count(property_id: str) -> Optional[dict]:
    """
    Increment view counter for a public property page visit.
    """
    try:
        oid = ObjectId(property_id)
    except InvalidId:
        return None

    updated = await property_collection.find_one_and_update(
        {"_id": oid},
        {"$inc": {"view_count": 1}},
        return_document=ReturnDocument.AFTER,
    )
    return property_helper(updated) if updated else None


def inquiry_helper(inquiry: Dict[str, Any]) -> Dict[str, Any]:
    _id = inquiry.get("_id")
    return {
        "id": str(_id) if _id is not None else "",
        "property_id": inquiry.get("property_id", ""),
        "owner_id": inquiry.get("owner_id", ""),
        "property_title": inquiry.get("property_title"),
        "city": inquiry.get("city"),
        "neighborhood": inquiry.get("neighborhood"),
        "name": inquiry.get("name"),
        "phone": inquiry.get("phone"),
        "message": inquiry.get("message", ""),
        "status": inquiry.get("status", "new"),
        "responded_at": inquiry.get("responded_at"),
        "created_at": inquiry.get("created_at") or datetime.utcnow(),
    }


async def create_property_inquiry_db(
    *,
    property_id: str,
    owner_id: str,
    property_title: Optional[str],
    city: Optional[str],
    neighborhood: Optional[str],
    name: Optional[str],
    phone: Optional[str],
    message: str,
) -> Dict[str, Any]:
    doc = {
        "property_id": property_id,
        "owner_id": owner_id,
        "property_title": property_title,
        "city": city,
        "neighborhood": neighborhood,
        "name": name,
        "phone": phone,
        "message": message,
        "status": "new",
        "responded_at": None,
        "created_at": datetime.utcnow(),
    }
    result = await inquiry_collection.insert_one(doc)
    saved = await inquiry_collection.find_one({"_id": result.inserted_id})
    return inquiry_helper(saved or doc)


async def get_owner_inquiries_db(owner_id: str, limit: int = 100) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    async for inq in inquiry_collection.find({"owner_id": owner_id}).sort("_id", -1).limit(limit):
        items.append(inquiry_helper(inq))
    return items


async def update_property_inquiry_status_db(
    owner_id: str,
    inquiry_id: str,
    status: str,
) -> Optional[Dict[str, Any]]:
    try:
        oid = ObjectId(inquiry_id)
    except InvalidId:
        return None

    update_doc: Dict[str, Any] = {
        "status": status,
        "responded_at": datetime.utcnow() if status == "responded" else None,
    }
    updated = await inquiry_collection.find_one_and_update(
        {"_id": oid, "owner_id": owner_id},
        {"$set": update_doc},
        return_document=ReturnDocument.AFTER,
    )
    return inquiry_helper(updated) if updated else None


async def count_owner_inquiries_db(owner_id: str) -> int:
    return await inquiry_collection.count_documents({"owner_id": owner_id})


async def count_owner_client_requests_db(owner_id: str) -> int:
    return await client_request_collection.count_documents({"owner_id": owner_id})


async def count_owner_client_offers_db(owner_id: str) -> int:
    return await client_offer_collection.count_documents({"owner_id": owner_id})


async def count_owner_total_views_db(owner_id: str) -> int:
    pipeline = [
        {"$match": {"owner_id": owner_id}},
        {"$group": {"_id": None, "total": {"$sum": {"$ifNull": ["$view_count", 0]}}}},
    ]
    rows = await property_collection.aggregate(pipeline).to_list(length=1)
    if not rows:
        return 0
    return int(rows[0].get("total", 0) or 0)

async def get_all_cities(owner_id: str) -> List[str]:
    """
    Retrieve a list of unique city names.
    """
    cities = await property_collection.distinct("city", {"owner_id": owner_id})
    return cities

async def get_all_neighborhoods(owner_id: str, city: Optional[str] = None) -> List[str]:
    """
    Retrieve a list of unique neighborhood names, optionally filtered by city.
    """
    query: Dict[str, Any] = {"owner_id": owner_id}
    if city:
        query["city"] = city
    neighborhoods = await property_collection.distinct("neighborhood", query)
    return neighborhoods


# ===== User helpers =====

def user_helper(user) -> dict:
    if not user:
        return None
    _id = user.get("_id")
    role = user.get("role") or "owner"
    status = user.get("status") or "active"
    permissions = user.get("permissions") or {}
    if role in {"employee", "manager"}:
        permissions = normalize_permissions(role, permissions)
    return {
        "id": str(_id) if _id is not None else None,
        "email": user.get("email"),
        "gemini_api_key": user.get("gemini_api_key"),
        "role": role,
        "status": status,
        "company_owner_id": user.get("company_owner_id") or (str(_id) if _id is not None else None),
        "display_name": user.get("display_name"),
        "permissions": permissions,
    }


async def get_user_by_email(email: str) -> Optional[dict]:
    user = await user_collection.find_one({"email": email})
    return user_helper(user) if user else None


async def get_user_by_id(user_id: str) -> Optional[dict]:
    try:
        oid = ObjectId(user_id)
    except InvalidId:
        return None
    user = await user_collection.find_one({"_id": oid})
    return user_helper(user) if user else None


async def create_user(
    email: str,
    password_hash: str,
    gemini_api_key: Optional[str] = None,
    role: str = "owner",
    company_owner_id: Optional[str] = None,
    status: str = "active",
    permissions: Optional[Dict[str, bool]] = None,
) -> dict:
    user_doc = {
        "email": email,
        "password_hash": password_hash,
        "gemini_api_key": gemini_api_key,
        "role": role,
        "status": status,
    }
    if company_owner_id:
        user_doc["company_owner_id"] = company_owner_id
    if permissions:
        user_doc["permissions"] = permissions

    result = await user_collection.insert_one(user_doc)
    new_user = await user_collection.find_one({"_id": result.inserted_id})

    # Ensure owners always have company_owner_id = their own id
    if role == "owner" and not new_user.get("company_owner_id"):
        owner_id_str = str(result.inserted_id)
        await user_collection.update_one(
            {"_id": result.inserted_id},
            {"$set": {"company_owner_id": owner_id_str}},
        )
        new_user["company_owner_id"] = owner_id_str

    return user_helper(new_user)


async def update_user_gemini_key(user_id: str, gemini_api_key: Optional[str]) -> Optional[dict]:
    try:
        oid = ObjectId(user_id)
    except InvalidId:
        return None
    updated = await user_collection.find_one_and_update(
        {"_id": oid},
        {"$set": {"gemini_api_key": gemini_api_key}},
        return_document=ReturnDocument.AFTER,
    )
    return user_helper(updated) if updated else None


async def update_user_display_name(user_id: str, display_name: Optional[str]) -> Optional[dict]:
    """Update user's display name for use in notes and other places."""
    try:
        oid = ObjectId(user_id)
    except InvalidId:
        return None
    update_doc = {"display_name": display_name} if display_name else {"display_name": None}
    updated = await user_collection.find_one_and_update(
        {"_id": oid},
        {"$set": update_doc},
        return_document=ReturnDocument.AFTER,
    )
    return user_helper(updated) if updated else None


async def get_team_for_owner(owner_user_id: str) -> List[dict]:
    """
    Return all users that belong to the given owner (company).
    """
    team: List[dict] = []
    async for user in user_collection.find({"company_owner_id": owner_user_id}):
        helper = user_helper(user)
        if helper:
            team.append(helper)

    # Fallback: if no explicit team users found, include the owner himself if present
    if not team:
        try:
            oid = ObjectId(owner_user_id)
        except InvalidId:
            return []
        owner = await user_collection.find_one({"_id": oid})
        helper = user_helper(owner)
        if helper:
            team.append(helper)
    return team


async def count_assigned_clients_for_user(owner_user_id: str, user_id: str) -> int:
    assigned_requests = await client_request_collection.count_documents(
        {"owner_id": owner_user_id, "assigned_user_id": user_id}
    )
    assigned_offers = await client_offer_collection.count_documents(
        {"owner_id": owner_user_id, "assigned_user_id": user_id}
    )
    return int(assigned_requests + assigned_offers)


async def count_assigned_properties_for_user(owner_user_id: str, user_id: str) -> int:
    return await property_collection.count_documents(
        {
            "owner_id": owner_user_id,
            "$or": [
                {"assigned_user_id": user_id},
                {"created_by_user_id": user_id},
            ],
        }
    )


async def update_employee_user(owner_user_id: str, user_id: str, updates: Dict[str, Any]) -> Optional[dict]:
    """
    Update an employee that belongs to a given owner (company). Owners cannot
    be demoted/updated through this function; it's for employees only.
    """
    try:
        oid = ObjectId(user_id)
    except InvalidId:
        return None

    allowed_fields = {"status", "permissions", "display_name", "role"}
    update_doc: Dict[str, Any] = {k: v for k, v in updates.items() if k in allowed_fields}
    if not update_doc:
        user = await user_collection.find_one({"_id": oid})
        return user_helper(user) if user else None

    current = await user_collection.find_one(
        {
            "_id": oid,
            "company_owner_id": owner_user_id,
            "role": {"$ne": "owner"},
        }
    )
    if not current:
        return None

    target_role = str(update_doc.get("role") or current.get("role") or "employee")
    if "permissions" in update_doc:
        update_doc["permissions"] = normalize_permissions(target_role, update_doc.get("permissions") or {})
    elif "role" in update_doc and target_role in {"employee", "manager"}:
        update_doc["permissions"] = normalize_permissions(target_role, current.get("permissions") or {})

    updated = await user_collection.find_one_and_update(
        {
            "_id": oid,
            "company_owner_id": owner_user_id,
            "role": {"$ne": "owner"},
        },
        {"$set": update_doc},
        return_document=ReturnDocument.AFTER,
    )
    return user_helper(updated) if updated else None


async def create_employee_user(
    owner_user_id: str,
    email: str,
    password_hash: str,
    permissions: Optional[Dict[str, bool]] = None,
    display_name: Optional[str] = None,
    role: str = "employee",
) -> dict:
    """
    Create a new employee user under the given owner.
    """
    user_role = role if role in {"manager", "employee"} else "employee"
    defaults = MANAGER_DEFAULT_PERMISSIONS if user_role == "manager" else DEFAULT_EMPLOYEE_PERMISSIONS
    perms = normalize_permissions(user_role, permissions or defaults)
    user_doc = {
        "email": email,
        "password_hash": password_hash,
        "gemini_api_key": None,
        "role": user_role,
        "company_owner_id": owner_user_id,
        "status": "active",
        "permissions": perms,
    }
    if display_name:
        user_doc["display_name"] = display_name
    
    result = await user_collection.insert_one(user_doc)
    new_user = await user_collection.find_one({"_id": result.inserted_id})
    return user_helper(new_user)


# ===== Company helpers =====

def company_helper(company: Dict[str, Any]) -> dict:
    if not company:
        return {}
    _id = company.get("_id")
    snapshot = derive_subscription_snapshot(company)
    return {
        "id": str(_id) if _id is not None else None,
        "owner_user_id": company.get("owner_user_id"),
        "company_name": company.get("company_name"),
        "logo_url": company.get("logo_url"),
        "official_email": company.get("official_email"),
        "contact_phone": company.get("contact_phone"),
        "subdomain": company.get("subdomain"),
        "plan_key": company.get("plan_key", "starter"),
        "is_subscribed": bool(snapshot.get("effective_is_subscribed", company.get("is_subscribed", False))),
        "subscription_started_at": company.get("subscription_started_at"),
        "subscription_ends_at": company.get("subscription_ends_at"),
        "billing_status": company.get("billing_status"),
        "cancel_at_period_end": company.get("cancel_at_period_end", False),
        "trial_used": company.get("trial_used", False),
        "subscription_status": snapshot.get("subscription_status"),
        "cancellation_reason": snapshot.get("cancellation_reason"),
        "auto_renewal_enabled": snapshot.get("auto_renewal_enabled"),
        "subscription_end_date_gregorian": snapshot.get("subscription_end_date_gregorian"),
        "stripe_customer_id": company.get("stripe_customer_id"),
        "stripe_subscription_id": company.get("stripe_subscription_id"),
        "appointment_reminder_email_cc_owner": company.get("appointment_reminder_email_cc_owner", True),
        "subscription_reminder_7d_sent": company.get("subscription_reminder_7d_sent", False),
        "subscription_reminder_3d_sent": company.get("subscription_reminder_3d_sent", False),
        "subscription_reminder_1d_sent": company.get("subscription_reminder_1d_sent", False),
        "subscription_reminder_0d_sent": company.get("subscription_reminder_0d_sent", False),
        "subscription_expired_sent": company.get("subscription_expired_sent", False),
        "created_at": company.get("created_at"),
        "updated_at": company.get("updated_at"),
    }


async def get_company_by_owner_id(owner_user_id: str) -> Optional[dict]:
    company = await company_collection.find_one({"owner_user_id": owner_user_id})
    return company_helper(company) if company else None


async def get_or_create_company_for_owner(owner_user_id: str) -> dict:
    """
    Ensure there is a company document for the given owner.
    If not, create a default one with the starter plan.
    """
    existing = await company_collection.find_one({"owner_user_id": owner_user_id})
    if existing:
        return company_helper(existing)

    now = datetime.utcnow()
    doc: Dict[str, Any] = {
        "owner_user_id": owner_user_id,
        "company_name": None,
        "logo_url": None,
        "official_email": None,
        "contact_phone": None,
        "subdomain": None,
        "plan_key": "starter",
        "is_subscribed": False,
        "subscription_started_at": None,
        "subscription_ends_at": None,
        "billing_status": None,
        "cancel_at_period_end": False,
        "trial_used": False,
        "stripe_customer_id": None,
        "stripe_subscription_id": None,
        "appointment_reminder_email_cc_owner": True,
        "subscription_reminder_7d_sent": False,
        "subscription_reminder_3d_sent": False,
        "subscription_reminder_1d_sent": False,
        "subscription_reminder_0d_sent": False,
        "subscription_expired_sent": False,
        "created_at": now,
        "updated_at": now,
    }
    result = await company_collection.insert_one(doc)
    doc["_id"] = result.inserted_id
    return company_helper(doc)


async def update_company_settings_db(owner_user_id: str, updates: Dict[str, Any]) -> Optional[dict]:
    """
    Update company settings for the given owner. Creates the company if missing.
    """
    # Ensure the company exists first
    company = await get_or_create_company_for_owner(owner_user_id)
    update_doc: Dict[str, Any] = {}
    for field in ("company_name", "logo_url", "official_email", "contact_phone"):
        if field in updates:
            update_doc[field] = updates[field]
    if not update_doc:
        return company

    update_doc["updated_at"] = datetime.utcnow()
    updated = await company_collection.find_one_and_update(
        {"_id": ObjectId(company["id"])},
        {"$set": update_doc},
        return_document=ReturnDocument.AFTER,
    )
    return company_helper(updated) if updated else None


async def set_company_plan_db(owner_user_id: str, plan_key: str) -> Optional[dict]:
    company = await get_or_create_company_for_owner(owner_user_id)
    now = datetime.utcnow()
    # نفترض اشتراك شهري مبدئياً (30 يوم)
    ends_at = now + timedelta(days=30)
    updated = await company_collection.find_one_and_update(
        {"_id": ObjectId(company["id"])},
        {
            "$set": {
                "plan_key": plan_key,
                "is_subscribed": True,
                "subscription_started_at": now,
                "subscription_ends_at": ends_at,
                "billing_status": "active",
                "cancel_at_period_end": False,
                "subscription_reminder_7d_sent": False,
                "subscription_reminder_3d_sent": False,
                "subscription_reminder_1d_sent": False,
                "subscription_reminder_0d_sent": False,
                "subscription_expired_sent": False,
                "updated_at": now,
            }
        },
        return_document=ReturnDocument.AFTER,
    )
    return company_helper(updated) if updated else None


async def start_company_free_trial_db(
    owner_user_id: str,
    plan_key: str,
    *,
    trial_days: int = 30,
) -> Optional[dict]:
    """
    Activate one free trial per company for the selected plan.
    """
    company = await get_or_create_company_for_owner(owner_user_id)
    now = datetime.utcnow()
    ends_at = now + timedelta(days=trial_days)

    updated = await company_collection.find_one_and_update(
        {
            "_id": ObjectId(company["id"]),
            "trial_used": {"$ne": True},
        },
        {
            "$set": {
                "plan_key": plan_key,
                "is_subscribed": True,
                "subscription_started_at": now,
                "subscription_ends_at": ends_at,
                "billing_status": "trialing",
                "cancel_at_period_end": True,
                "trial_used": True,
                "subscription_reminder_7d_sent": False,
                "subscription_reminder_3d_sent": False,
                "subscription_reminder_1d_sent": False,
                "subscription_reminder_0d_sent": False,
                "subscription_expired_sent": False,
                "updated_at": now,
            }
        },
        return_document=ReturnDocument.AFTER,
    )
    return company_helper(updated) if updated else None


async def update_company_plan_key(owner_user_id: str, plan_key: str) -> Optional[dict]:
    """
    تحديث الخطة المختارة فقط بدون تفعيل الاشتراك أو تغيير تواريخ الاشتراك.
    يُستخدم عند اختيار الخطة في صفحة الإعدادات، بينما التفعيل يتم عبر بوابة الدفع.
    """
    company = await get_or_create_company_for_owner(owner_user_id)
    updated = await company_collection.find_one_and_update(
        {"_id": ObjectId(company["id"])},
        {
            "$set": {
                "plan_key": plan_key,
                "updated_at": datetime.utcnow(),
            }
        },
        return_document=ReturnDocument.AFTER,
    )
    return company_helper(updated) if updated else None


async def set_company_stripe_customer_id(owner_user_id: str, stripe_customer_id: str) -> Optional[dict]:
    company = await get_or_create_company_for_owner(owner_user_id)
    updated = await company_collection.find_one_and_update(
        {"_id": ObjectId(company["id"])},
        {"$set": {"stripe_customer_id": stripe_customer_id, "updated_at": datetime.utcnow()}},
        return_document=ReturnDocument.AFTER,
    )
    return company_helper(updated) if updated else None


async def get_company_by_stripe_customer_id(stripe_customer_id: str) -> Optional[dict]:
    company = await company_collection.find_one({"stripe_customer_id": stripe_customer_id})
    return company_helper(company) if company else None


async def update_company_billing_from_stripe(
    owner_user_id: str,
    *,
    stripe_customer_id: Optional[str] = None,
    stripe_subscription_id: Optional[str] = None,
    plan_key: Optional[str] = None,
    billing_status: Optional[str] = None,
    cancel_at_period_end: Optional[bool] = None,
    is_subscribed: Optional[bool] = None,
    subscription_started_at: Optional[datetime] = None,
    subscription_ends_at: Optional[datetime] = None,
) -> Optional[dict]:
    company = await get_or_create_company_for_owner(owner_user_id)
    update_doc: Dict[str, Any] = {"updated_at": datetime.utcnow()}
    if stripe_customer_id is not None:
        update_doc["stripe_customer_id"] = stripe_customer_id
    if stripe_subscription_id is not None:
        update_doc["stripe_subscription_id"] = stripe_subscription_id
    if plan_key is not None:
        update_doc["plan_key"] = plan_key
    if billing_status is not None:
        update_doc["billing_status"] = billing_status
    if cancel_at_period_end is not None:
        update_doc["cancel_at_period_end"] = cancel_at_period_end
    if is_subscribed is not None:
        update_doc["is_subscribed"] = is_subscribed
    if subscription_started_at is not None:
        update_doc["subscription_started_at"] = subscription_started_at
    if subscription_ends_at is not None:
        update_doc["subscription_ends_at"] = subscription_ends_at

    current_end = company.get("subscription_ends_at")
    should_reset_subscription_email_flags = False
    if subscription_ends_at is not None and subscription_ends_at != current_end:
        should_reset_subscription_email_flags = True
    if is_subscribed is True and not bool(company.get("is_subscribed", False)):
        should_reset_subscription_email_flags = True

    # Reset reminder flags only when a new subscription cycle actually starts/changes.
    if should_reset_subscription_email_flags:
        update_doc.update(
            {
                "subscription_reminder_7d_sent": False,
                "subscription_reminder_3d_sent": False,
                "subscription_reminder_1d_sent": False,
                "subscription_reminder_0d_sent": False,
                "subscription_expired_sent": False,
            }
        )

    updated = await company_collection.find_one_and_update(
        {"_id": ObjectId(company["id"])},
        {"$set": update_doc},
        return_document=ReturnDocument.AFTER,
    )
    return company_helper(updated) if updated else None


async def get_company_by_subdomain(subdomain: str) -> Optional[dict]:
    company = await company_collection.find_one({"subdomain": subdomain})
    return company_helper(company) if company else None


async def set_company_subdomain_db(owner_user_id: str, subdomain: str) -> Optional[dict]:
    company = await get_or_create_company_for_owner(owner_user_id)
    updated = await company_collection.find_one_and_update(
        {"_id": ObjectId(company["id"])},
        {"$set": {"subdomain": subdomain, "updated_at": datetime.utcnow()}},
        return_document=ReturnDocument.AFTER,
    )
    return company_helper(updated) if updated else None


async def consume_company_daily_ai_quota(owner_user_id: str, daily_limit: int = 30) -> dict:
    """
    Consume one AI analysis from the company's daily quota.
    Quota is tracked per owner/company by UTC date.
    """
    company = await get_or_create_company_for_owner(owner_user_id)
    company_id = ObjectId(company["id"])
    raw = await company_collection.find_one({"_id": company_id}) or {}

    today = datetime.utcnow().strftime("%Y-%m-%d")
    usage = raw.get("ai_daily_usage") or {}
    usage_date = usage.get("date")
    usage_count = usage.get("count", 0)
    try:
        usage_count = int(usage_count)
    except Exception:
        usage_count = 0

    current_count = usage_count if usage_date == today else 0
    if current_count >= daily_limit:
        return {
            "allowed": False,
            "limit": daily_limit,
            "used": current_count,
            "remaining": 0,
            "date": today,
        }

    next_count = current_count + 1
    await company_collection.update_one(
        {"_id": company_id},
        {
            "$set": {
                "ai_daily_usage": {"date": today, "count": next_count},
                "updated_at": datetime.utcnow(),
            }
        },
    )
    return {
        "allowed": True,
        "limit": daily_limit,
        "used": next_count,
        "remaining": max(daily_limit - next_count, 0),
        "date": today,
    }


async def get_platform_stats_db() -> Dict[str, int]:
    """
    Return global platform stats for platform owner dashboard.
    """
    total_users = await user_collection.count_documents({})
    total_owners = await user_collection.count_documents(
        {"$or": [{"role": "owner"}, {"role": None}, {"role": {"$exists": False}}]}
    )
    total_employees = await user_collection.count_documents({"role": "employee"})
    total_offices = await company_collection.count_documents({})
    total_properties = await property_collection.count_documents({})
    subscribed_offices = await company_collection.count_documents({"is_subscribed": True})
    trialing_offices = await company_collection.count_documents({"billing_status": "trialing"})
    unsubscribed_offices = await company_collection.count_documents({"is_subscribed": False})

    return {
        "total_users": total_users,
        "total_owners": total_owners,
        "total_employees": total_employees,
        "total_offices": total_offices,
        "total_properties": total_properties,
        "subscribed_offices": subscribed_offices,
        "trialing_offices": trialing_offices,
        "unsubscribed_offices": unsubscribed_offices,
    }


async def get_platform_offices_overview_db(limit: int = 500) -> List[Dict[str, Any]]:
    """
    List offices with aggregate counts for platform admin dashboard.
    """
    results: List[Dict[str, Any]] = []
    cursor = company_collection.find({}).sort("updated_at", -1).limit(limit)
    async for company_doc in cursor:
        company = company_helper(company_doc)
        owner_id = company.get("owner_user_id")
        if not owner_id:
            continue

        owner_email: Optional[str] = None
        if owner_id:
            try:
                owner = await user_collection.find_one({"_id": ObjectId(owner_id)})
            except Exception:
                owner = None
            if owner:
                owner_email = owner.get("email")

        total_employees = await user_collection.count_documents(
            {"company_owner_id": owner_id, "role": "employee"}
        )
        total_properties = await property_collection.count_documents({"owner_id": owner_id})

        results.append(
            {
                "owner_user_id": owner_id,
                "owner_email": owner_email,
                "company_name": company.get("company_name"),
                "plan_key": company.get("plan_key", "starter"),
                "is_subscribed": bool(company.get("is_subscribed", False)),
                "billing_status": company.get("billing_status"),
                "trial_used": bool(company.get("trial_used", False)),
                "subscription_started_at": company.get("subscription_started_at"),
                "subscription_ends_at": company.get("subscription_ends_at"),
                "subscription_status": company.get("subscription_status"),
                "cancellation_reason": company.get("cancellation_reason"),
                "auto_renewal_enabled": company.get("auto_renewal_enabled"),
                "subscription_end_date_gregorian": company.get("subscription_end_date_gregorian"),
                "total_properties": int(total_properties),
                "total_employees": int(total_employees),
                "created_at": company.get("created_at"),
                "updated_at": company.get("updated_at"),
            }
        )
    return results


async def get_platform_office_detail_db(owner_user_id: str, properties_limit: int = 200) -> Optional[Dict[str, Any]]:
    """
    Return full office details including employees and properties.
    """
    company_doc = await company_collection.find_one({"owner_user_id": owner_user_id})
    if not company_doc:
        return None
    company = company_helper(company_doc)

    owner_email: Optional[str] = None
    try:
        owner = await user_collection.find_one({"_id": ObjectId(owner_user_id)})
    except Exception:
        owner = None
    if owner:
        owner_email = owner.get("email")

    employees: List[Dict[str, Any]] = []
    async for emp in user_collection.find(
        {"company_owner_id": owner_user_id, "role": "employee"}
    ).sort("email", 1):
        helper = user_helper(emp)
        if helper:
            employees.append(
                {
                    "id": helper.get("id") or "",
                    "email": helper.get("email") or "",
                    "role": helper.get("role", "employee"),
                    "status": helper.get("status", "active"),
                    "permissions": helper.get("permissions") or {},
                }
            )

    total_properties = await property_collection.count_documents({"owner_id": owner_user_id})

    properties: List[Dict[str, Any]] = []
    async for prop in (
        property_collection.find({"owner_id": owner_user_id}).sort("_id", -1).limit(properties_limit)
    ):
        p = property_helper(prop)
        properties.append(
            {
                "id": p.get("id"),
                "city": p.get("city") or "غير مذكور",
                "neighborhood": p.get("neighborhood") or "غير مذكور",
                "property_type": p.get("property_type") or "غير مذكور",
                "area": float(p.get("area") or 0.0),
                "price": float(p.get("price") or 0.0),
                "owner_name": p.get("owner_name"),
            }
        )

    return {
        "owner_user_id": owner_user_id,
        "owner_email": owner_email,
        "company_name": company.get("company_name"),
        "plan_key": company.get("plan_key", "starter"),
        "is_subscribed": bool(company.get("is_subscribed", False)),
        "billing_status": company.get("billing_status"),
        "trial_used": bool(company.get("trial_used", False)),
        "subscription_started_at": company.get("subscription_started_at"),
        "subscription_ends_at": company.get("subscription_ends_at"),
        "subscription_status": company.get("subscription_status"),
        "cancellation_reason": company.get("cancellation_reason"),
        "auto_renewal_enabled": company.get("auto_renewal_enabled"),
        "subscription_end_date_gregorian": company.get("subscription_end_date_gregorian"),
        "total_properties": int(total_properties),
        "total_employees": len(employees),
        "created_at": company.get("created_at"),
        "updated_at": company.get("updated_at"),
        "contact_phone": company.get("contact_phone"),
        "official_email": company.get("official_email"),
        "subdomain": company.get("subdomain"),
        "employees": employees,
        "properties": properties,
    }


async def delete_platform_office_data_db(owner_user_id: str) -> Dict[str, int]:
    """
    Permanently delete office/company data for a specific owner.
    """
    deleted: Dict[str, int] = {}
    deleted["properties"] = int((await property_collection.delete_many({"owner_id": owner_user_id})).deleted_count)
    deleted["property_inquiries"] = int((await inquiry_collection.delete_many({"owner_id": owner_user_id})).deleted_count)
    deleted["client_requests"] = int((await client_request_collection.delete_many({"owner_id": owner_user_id})).deleted_count)
    deleted["client_request_notes"] = int((await client_request_notes_collection.delete_many({"owner_id": owner_user_id})).deleted_count)
    deleted["client_offers"] = int((await client_offer_collection.delete_many({"owner_id": owner_user_id})).deleted_count)
    deleted["client_offer_notes"] = int((await client_offer_note_collection.delete_many({"owner_id": owner_user_id})).deleted_count)
    deleted["client_profiles"] = int((await client_profile_collection.delete_many({"owner_id": owner_user_id})).deleted_count)
    deleted["appointments"] = int((await appointment_collection.delete_many({"owner_id": owner_user_id})).deleted_count)
    deleted["marketing_leads"] = int((await marketing_lead_collection.delete_many({"owner_id": owner_user_id})).deleted_count)
    deleted["marketing_events"] = int((await marketing_event_collection.delete_many({"owner_id": owner_user_id})).deleted_count)
    deleted["notifications"] = int((await notification_collection.delete_many({"owner_id": owner_user_id})).deleted_count)
    deleted["notification_queue"] = int((await notification_queue_collection.delete_many({"owner_id": owner_user_id})).deleted_count)
    deleted["companies"] = int((await company_collection.delete_many({"owner_user_id": owner_user_id})).deleted_count)
    deleted["team_users"] = int((await user_collection.delete_many({"company_owner_id": owner_user_id})).deleted_count)
    try:
        owner_oid = ObjectId(owner_user_id)
        deleted["owner_user"] = int((await user_collection.delete_one({"_id": owner_oid})).deleted_count)
    except Exception:
        deleted["owner_user"] = 0
    return deleted


def client_request_helper(item: Dict[str, Any]) -> Dict[str, Any]:
    _id = item.get("_id")
    return {
        "id": str(_id) if _id is not None else "",
        "owner_id": item.get("owner_id", ""),
        "profile_id": item.get("profile_id") or item.get("client_profile_id"),
        "raw_text": item.get("raw_text", ""),
        "client_name": item.get("client_name", "غير محدد"),
        "phone_number": item.get("phone_number"),
        "assigned_user_id": item.get("assigned_user_id"),
        "assigned_user_name": item.get("assigned_user_name"),
        "_assignment_bound": ("assigned_user_id" in item) or ("assigned_user_name" in item),
        "property_type": item.get("property_type", "غير محدد"),
        "city": item.get("city", "غير محدد"),
        "neighborhoods": item.get("neighborhoods", []) or [],
        "budget_min": item.get("budget_min"),
        "budget_max": item.get("budget_max"),
        "area_min": item.get("area_min"),
        "area_max": item.get("area_max"),
        "additional_requirements": item.get("additional_requirements", ""),
        "action_plan": item.get("action_plan", ""),
        "reminder_type": item.get("reminder_type"),
        "deadline_at": item.get("deadline_at"),
        "reminder_before_minutes": int(item.get("reminder_before_minutes", 120) or 120),
        "reminder_sent_at": item.get("reminder_sent_at"),
        "follow_up_details": item.get("follow_up_details"),
        "lead_source": item.get("lead_source"),
        "related_property_id": item.get("related_property_id"),
        "status": item.get("status", "new"),
        "created_at": item.get("created_at") or datetime.utcnow(),
        "updated_at": item.get("updated_at") or datetime.utcnow(),
    }


async def create_client_request_db(owner_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    now = datetime.utcnow()
    doc = {
        "owner_id": owner_id,
        "profile_id": payload.get("profile_id"),
        "raw_text": payload.get("raw_text", ""),
        "client_name": payload.get("client_name", "غير محدد"),
        "phone_number": payload.get("phone_number"),
        "assigned_user_id": payload.get("assigned_user_id"),
        "assigned_user_name": payload.get("assigned_user_name"),
        "property_type": payload.get("property_type", "غير محدد"),
        "city": payload.get("city", "غير محدد"),
        "neighborhoods": payload.get("neighborhoods", []) or [],
        "budget_min": payload.get("budget_min"),
        "budget_max": payload.get("budget_max"),
        "area_min": payload.get("area_min"),
        "area_max": payload.get("area_max"),
        "additional_requirements": payload.get("additional_requirements", ""),
        "action_plan": payload.get("action_plan", ""),
        "reminder_type": payload.get("reminder_type"),
        "deadline_at": payload.get("deadline_at"),
        "reminder_before_minutes": int(payload.get("reminder_before_minutes", 120) or 120),
        "reminder_sent_at": payload.get("reminder_sent_at"),
        "follow_up_details": payload.get("follow_up_details"),
        "lead_source": payload.get("lead_source"),
        "related_property_id": payload.get("related_property_id"),
        "status": payload.get("status", "new"),
        "created_at": now,
        "updated_at": now,
    }
    result = await client_request_collection.insert_one(doc)
    saved = await client_request_collection.find_one({"_id": result.inserted_id})
    return client_request_helper(saved or doc)


async def get_client_requests_db(owner_id: str, limit: int = 200) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    async for row in client_request_collection.find({"owner_id": owner_id}).sort("_id", -1).limit(limit):
        items.append(client_request_helper(row))
    return items


async def update_client_request_db(owner_id: str, request_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    try:
        oid = ObjectId(request_id)
    except InvalidId:
        return None
    if not updates:
        found = await client_request_collection.find_one({"_id": oid, "owner_id": owner_id})
        return client_request_helper(found) if found else None
    updates["updated_at"] = datetime.utcnow()
    updated = await client_request_collection.find_one_and_update(
        {"_id": oid, "owner_id": owner_id},
        {"$set": updates},
        return_document=ReturnDocument.AFTER,
    )
    return client_request_helper(updated) if updated else None


async def get_client_request_by_id_db(owner_id: str, request_id: str) -> Optional[Dict[str, Any]]:
    try:
        oid = ObjectId(request_id)
    except InvalidId:
        return None
    found = await client_request_collection.find_one({"_id": oid, "owner_id": owner_id})
    return client_request_helper(found) if found else None


async def delete_client_request_db(owner_id: str, request_id: str) -> bool:
    try:
        oid = ObjectId(request_id)
    except InvalidId:
        return False
    result = await client_request_collection.delete_one({"_id": oid, "owner_id": owner_id})
    return result.deleted_count == 1


# ===== Client Request Notes =====


def client_note_helper(item: Dict[str, Any]) -> Dict[str, Any]:
    """Convert DB document to API response format."""
    return {
        "id": str(item.get("_id", "")),
        "request_id": item.get("request_id", ""),
        "owner_id": item.get("owner_id", ""),
        "content": item.get("content", ""),
        "author_name": item.get("author_name", ""),
        "author_role": item.get("author_role", "owner"),
        "color": item.get("color", "#3f7d3c"),
        "created_at": item.get("created_at"),
    }


async def create_client_note_db(owner_id: str, request_id: str, note_data: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new note for a client request."""
    doc = {
        "owner_id": owner_id,
        "request_id": request_id,
        "content": note_data.get("content", ""),
        "author_name": note_data.get("author_name", "غير محدد"),
        "author_role": note_data.get("author_role", "owner"),
        "color": note_data.get("color", "#3f7d3c"),
        "created_at": datetime.utcnow(),
    }
    result = await client_request_notes_collection.insert_one(doc)
    saved = await client_request_notes_collection.find_one({"_id": result.inserted_id})
    return client_note_helper(saved or doc)


async def get_client_notes_db(owner_id: str, request_id: str) -> List[Dict[str, Any]]:
    """Get all notes for a client request."""
    items = []
    async for row in client_request_notes_collection.find(
        {"owner_id": owner_id, "request_id": request_id}
    ).sort("created_at", -1):
        items.append(client_note_helper(row))
    return items


async def update_client_note_db(owner_id: str, note_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Update a client note."""
    try:
        oid = ObjectId(note_id)
    except InvalidId:
        return None
    if not updates:
        found = await client_request_notes_collection.find_one({"_id": oid, "owner_id": owner_id})
        return client_note_helper(found) if found else None
    updates["updated_at"] = datetime.utcnow()
    updated = await client_request_notes_collection.find_one_and_update(
        {"_id": oid, "owner_id": owner_id},
        {"$set": updates},
        return_document=ReturnDocument.AFTER,
    )
    return client_note_helper(updated) if updated else None


async def delete_client_note_db(owner_id: str, note_id: str) -> bool:
    """Delete a client note."""
    try:
        oid = ObjectId(note_id)
    except InvalidId:
        return False
    result = await client_request_notes_collection.delete_one({"_id": oid, "owner_id": owner_id})
    return result.deleted_count == 1


async def enqueue_deadline_notification_db(owner_id: str, request_item: Dict[str, Any]) -> None:
    """
    Queue a reminder event once when request deadline is close.
    Email sending will be connected later by a worker.
    """
    request_id = request_item.get("id")
    deadline_at = request_item.get("deadline_at")
    reminder_sent_at = request_item.get("reminder_sent_at")
    if not request_id or not isinstance(deadline_at, datetime) or reminder_sent_at:
        return
    reminder_before_minutes = int(request_item.get("reminder_before_minutes", 120) or 120)
    trigger_time = deadline_at - timedelta(minutes=reminder_before_minutes)
    if datetime.utcnow() < trigger_time:
        return

    doc = {
        "owner_id": owner_id,
        "type": "client_deadline_reminder",
        "client_request_id": request_id,
        "deadline_at": deadline_at,
        "triggered_at": datetime.utcnow(),
        "status": "pending",
        "payload": {
            "client_name": request_item.get("client_name"),
            "phone_number": request_item.get("phone_number"),
            "reminder_type": request_item.get("reminder_type"),
            "action_plan": request_item.get("action_plan"),
        },
    }
    await notification_queue_collection.update_one(
        {
            "type": "client_deadline_reminder",
            "owner_id": owner_id,
            "client_request_id": request_id,
            "deadline_at": deadline_at,
        },
        {"$setOnInsert": doc},
        upsert=True,
    )
    await update_client_request_db(
        owner_id,
        request_id,
        {"reminder_sent_at": datetime.utcnow()},
    )


# ===== Client Offers (Properties assigned to clients) =====


def client_offer_helper(item: Dict[str, Any]) -> Dict[str, Any]:
    """Convert DB document to API response format."""
    _id = item.get("_id")
    return {
        "id": str(_id) if _id is not None else "",
        "owner_id": item.get("owner_id", ""),
        "profile_id": item.get("profile_id") or item.get("client_profile_id"),
        "client_name": item.get("client_name", "غير محدد"),
        "phone_number": item.get("phone_number"),
        "assigned_user_id": item.get("assigned_user_id"),
        "assigned_user_name": item.get("assigned_user_name"),
        "_assignment_bound": ("assigned_user_id" in item) or ("assigned_user_name" in item),
        "property_id": item.get("property_id", ""),
        "status": item.get("status", "active"),
        "notes": item.get("notes", ""),
        "reminder_type": item.get("reminder_type"),
        "deadline_at": item.get("deadline_at"),
        "reminder_before_minutes": item.get("reminder_before_minutes", 120),
        "follow_up_details": item.get("follow_up_details"),
        "created_at": item.get("created_at") or datetime.utcnow(),
    }


async def create_client_offer_db(owner_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new client offer (link a property to a client)."""
    doc = {
        "owner_id": owner_id,
        "profile_id": payload.get("profile_id"),
        "client_name": payload.get("client_name", "غير محدد"),
        "phone_number": payload.get("phone_number"),
        "assigned_user_id": payload.get("assigned_user_id"),
        "assigned_user_name": payload.get("assigned_user_name"),
        "property_id": payload.get("property_id", ""),
        "status": payload.get("status", "new"),  # Default to "new" for new offers
        "notes": payload.get("notes", ""),
        "reminder_type": payload.get("reminder_type"),
        "deadline_at": payload.get("deadline_at"),
        "reminder_before_minutes": payload.get("reminder_before_minutes", 120),
        "follow_up_details": payload.get("follow_up_details"),
        "created_at": datetime.utcnow(),
    }
    result = await client_offer_collection.insert_one(doc)
    saved = await client_offer_collection.find_one({"_id": result.inserted_id})
    return client_offer_helper(saved or doc)


async def get_client_offers_db(owner_id: str, limit: int = 200) -> List[Dict[str, Any]]:
    """Get all client offers for an owner."""
    items: List[Dict[str, Any]] = []
    async for row in client_offer_collection.find({"owner_id": owner_id}).sort("_id", -1).limit(limit):
        items.append(client_offer_helper(row))
    return items


async def get_assigned_offer_property_ids(owner_id: str, user_id: str) -> List[str]:
    rows = await client_offer_collection.distinct(
        "property_id",
        {
            "owner_id": owner_id,
            "assigned_user_id": user_id,
            "property_id": {"$exists": True, "$ne": None, "$ne": ""},
        },
    )
    return [str(v).strip() for v in rows if str(v).strip()]


async def get_client_offers_by_client_db(
    owner_id: str,
    client_name: str,
    phone_number: Optional[str] = None,
    profile_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Get offers for a client: by profile_id, legacy rows without profile_id, and same identity (name/phone) even if profile_id was wrong or duplicated."""
    items: List[Dict[str, Any]] = []

    if profile_id:
        profile_doc: Optional[Dict[str, Any]] = None
        try:
            pid_oid = ObjectId(profile_id)
            profile_doc = await client_profile_collection.find_one({"_id": pid_oid, "owner_id": owner_id})
        except (InvalidId, TypeError):
            profile_doc = None

        effective_name = (profile_doc.get("client_name") if profile_doc else None) or client_name or ""
        eff_phone = phone_number
        if (not eff_phone or not str(eff_phone).strip()) and profile_doc:
            eff_phone = profile_doc.get("phone_number")

        safe_name = re.escape((effective_name or "").strip())
        name_regex = {"$regex": f"^{safe_name}$", "$options": "i"}

        phone_clause: Dict[str, Any] = {}
        identity_phone_clause: Dict[str, Any] = {}
        if eff_phone and str(eff_phone).strip():
            safe_phone = re.escape(str(eff_phone).strip())
            prx = {"$regex": f"^{safe_phone}$", "$options": "i"}
            phone_clause = {"phone_number": prx}
            identity_phone_clause = {"phone_number": prx}

        legacy_no_profile = {
            "$or": [
                {"profile_id": None},
                {"profile_id": ""},
                {"profile_id": {"$exists": False}},
            ]
        }
        legacy: Dict[str, Any] = {
            "owner_id": owner_id,
            "client_name": name_regex,
            **phone_clause,
            **legacy_no_profile,
        }
        # Same person: all offers with this canonical name/phone (even wrong/duplicate profile_id on the row)
        identity_match: Dict[str, Any] = {
            "owner_id": owner_id,
            "client_name": name_regex,
            **identity_phone_clause,
        }
        or_clauses: List[Dict[str, Any]] = [
            {"profile_id": profile_id},
            legacy,
        ]
        # Avoid name-only identity (too broad); with phone we include rows tied to wrong/duplicate profile_id
        if identity_phone_clause:
            or_clauses.append(identity_match)
        query = {
            "owner_id": owner_id,
            "$or": or_clauses,
        }
    else:
        safe_name = re.escape((client_name or "").strip())
        name_regex = {"$regex": f"^{safe_name}$", "$options": "i"}
        query = {
            "owner_id": owner_id,
            "client_name": name_regex,
        }
        if phone_number and str(phone_number).strip():
            safe_phone = re.escape(str(phone_number).strip())
            query["phone_number"] = {"$regex": f"^{safe_phone}$", "$options": "i"}

    async for row in client_offer_collection.find(query).sort("_id", -1):
        items.append(client_offer_helper(row))
    return items


async def get_client_offer_by_id_db(owner_id: str, offer_id: str) -> Optional[Dict[str, Any]]:
    """Get a single client offer by ID for an owner."""
    try:
        oid = ObjectId(offer_id)
    except InvalidId:
        return None
    found = await client_offer_collection.find_one({"_id": oid, "owner_id": owner_id})
    return client_offer_helper(found) if found else None


async def update_client_offer_db(
    owner_id: str, offer_id: str, updates: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    """Update a client offer."""
    try:
        oid = ObjectId(offer_id)
    except InvalidId:
        return None
    if not updates:
        found = await client_offer_collection.find_one({"_id": oid, "owner_id": owner_id})
        return client_offer_helper(found) if found else None
    updated = await client_offer_collection.find_one_and_update(
        {"_id": oid, "owner_id": owner_id},
        {"$set": updates},
        return_document=ReturnDocument.AFTER,
    )
    return client_offer_helper(updated) if updated else None


async def delete_client_offer_db(owner_id: str, offer_id: str) -> bool:
    """Delete a client offer."""
    try:
        oid = ObjectId(offer_id)
    except InvalidId:
        return False
    result = await client_offer_collection.delete_one({"_id": oid, "owner_id": owner_id})
    return result.deleted_count == 1


# ===== Client Offer Notes DB functions =====

client_offer_note_collection = database.get_collection("client_offer_notes")


def client_offer_note_helper(item: Dict[str, Any]) -> Dict[str, Any]:
    """Transform a client offer note document for API responses."""
    return {
        "id": str(item.get("_id")),
        "offer_id": item.get("offer_id"),
        "request_id": "",  # Client offer notes don't have request_id, use offer_id instead
        "owner_id": item.get("owner_id"),
        "content": item.get("content", ""),
        "author_name": item.get("author_name", "غير محدد"),
        "author_role": item.get("author_role", "owner"),
        "color": item.get("color", "#3f7d3c"),
        "created_at": item.get("created_at"),
    }


async def create_client_offer_note_db(owner_id: str, offer_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Create a note for a client offer."""
    doc = {
        **payload,
        "owner_id": owner_id,
        "offer_id": offer_id,
        "author_name": payload.get("author_name", "غير محدد"),
        "author_role": payload.get("author_role", "owner"),
        "color": payload.get("color", "#cfd6cf"),
        "created_at": datetime.utcnow(),
    }
    result = await client_offer_note_collection.insert_one(doc)
    saved = await client_offer_note_collection.find_one({"_id": result.inserted_id})
    return client_offer_note_helper(saved or doc)


async def get_client_offer_notes_db(offer_id: str) -> List[Dict[str, Any]]:
    """Get all notes for a client offer."""
    items: List[Dict[str, Any]] = []
    async for row in client_offer_note_collection.find({"offer_id": offer_id}).sort("created_at", -1):
        items.append(client_offer_note_helper(row))
    return items


async def update_client_offer_note_db(owner_id: str, note_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Update a client offer note."""
    try:
        nid = ObjectId(note_id)
    except InvalidId:
        return None
    # Build update document
    update_doc = {k: v for k, v in updates.items() if v is not None}
    if not update_doc:
        return None
    updated = await client_offer_note_collection.find_one_and_update(
        {"_id": nid, "owner_id": owner_id},
        {"$set": update_doc},
        return_document=ReturnDocument.AFTER,
    )
    return client_offer_note_helper(updated) if updated else None


async def delete_client_offer_note_db(owner_id: str, note_id: str) -> bool:
    """Delete a client offer note."""
    try:
        nid = ObjectId(note_id)
    except InvalidId:
        return False
    result = await client_offer_note_collection.delete_one({"_id": nid, "owner_id": owner_id})
    return result.deleted_count == 1


# ===== Client Profiles (independent from requests/offers) =====


def client_profile_helper(item: Dict[str, Any]) -> Dict[str, Any]:
    """Convert DB document to API response format."""
    _id = item.get("_id")
    return {
        "id": str(_id) if _id is not None else "",
        "owner_id": item.get("owner_id", ""),
        "client_name": item.get("client_name", ""),
        "phone_number": item.get("phone_number"),
        "notes": item.get("notes", ""),
        "client_types": item.get("client_types") or [],
        "assigned_user_id": item.get("assigned_user_id"),
        "assigned_user_name": item.get("assigned_user_name"),
        "created_at": item.get("created_at") or datetime.utcnow(),
        "updated_at": item.get("updated_at") or datetime.utcnow(),
    }


def _sanitize_client_types_lane(types: Any) -> List[str]:
    """At most one of request/offer — never both on the same profile document."""
    raw = [str(t) for t in (types or []) if t in ("request", "offer")]
    if not raw:
        return []
    if "request" in raw and "offer" in raw:
        return [raw[0]]
    return list(dict.fromkeys(raw))


async def create_client_profile_db(owner_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new client profile (independent from requests/offers)."""
    now = datetime.utcnow()
    client_types = _sanitize_client_types_lane(payload.get("client_types"))
    doc = {
        "owner_id": owner_id,
        "client_name": payload.get("client_name", ""),
        "phone_number": payload.get("phone_number"),
        "notes": payload.get("notes", ""),
        "client_types": client_types,
        "assigned_user_id": payload.get("assigned_user_id"),
        "assigned_user_name": payload.get("assigned_user_name"),
        "created_at": now,
        "updated_at": now,
    }
    result = await client_profile_collection.insert_one(doc)
    saved = await client_profile_collection.find_one({"_id": result.inserted_id})
    return client_profile_helper(saved or doc)


async def get_client_profiles_db(
    owner_id: str, 
    limit: int = 200, 
    client_type_filter: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Get client profiles for an owner, optionally filtered by client_type.
    
    Args:
        owner_id: The owner user ID
        limit: Maximum number of profiles to return
        client_type_filter: If provided, only return profiles with this type in client_types
                         "request" -> profiles with "request" in client_types
                         "offer" -> profiles with "offer" in client_types
    """
    query: Dict[str, Any] = {"owner_id": owner_id}

    if client_type_filter == "offer":
        query = {
            "$and": [
                {"owner_id": owner_id},
                {"client_types": {"$in": ["offer"]}},
                {"client_types": {"$nin": ["request"]}},
            ]
        }
    elif client_type_filter == "request":
        query = {"owner_id": owner_id, "client_types": {"$in": ["request"]}}
    
    items: List[Dict[str, Any]] = []
    async for row in client_profile_collection.find(query).sort("_id", -1).limit(limit):
        items.append(client_profile_helper(row))
    return items


async def get_client_profile_by_id_db(owner_id: str, profile_id: str) -> Optional[Dict[str, Any]]:
    """Get a client profile by ID."""
    try:
        oid = ObjectId(profile_id)
    except InvalidId:
        return None
    found = await client_profile_collection.find_one({"_id": oid, "owner_id": owner_id})
    return client_profile_helper(found) if found else None


async def update_client_profile_db(
    owner_id: str, profile_id: str, updates: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    """Update a client profile."""
    try:
        oid = ObjectId(profile_id)
    except InvalidId:
        return None
    if not updates:
        found = await client_profile_collection.find_one({"_id": oid, "owner_id": owner_id})
        return client_profile_helper(found) if found else None
    if "client_types" in updates and updates["client_types"] is not None:
        updates["client_types"] = _sanitize_client_types_lane(updates["client_types"])
    updates["updated_at"] = datetime.utcnow()
    updated = await client_profile_collection.find_one_and_update(
        {"_id": oid, "owner_id": owner_id},
        {"$set": updates},
        return_document=ReturnDocument.AFTER,
    )
    return client_profile_helper(updated) if updated else None


async def delete_client_profile_db(owner_id: str, profile_id: str) -> bool:
    """Delete a client profile."""
    try:
        oid = ObjectId(profile_id)
    except InvalidId:
        return False
    result = await client_profile_collection.delete_one({"_id": oid, "owner_id": owner_id})
    return result.deleted_count == 1


async def get_client_profiles_by_type_db(owner_id: str, client_type: str, limit: int = 200) -> List[Dict[str, Any]]:
    """
    Profiles for the Requests vs Offers tabs — lanes stay separate.

    - offer tab: profiles that have "offer" and do NOT have "request" (no merged rows).
    - request tab: profiles that have "request" (includes legacy merged so they stay manageable).
    """
    query: Dict[str, Any] = {"owner_id": owner_id}
    if client_type == "offer":
        query = {
            "$and": [
                {"owner_id": owner_id},
                {"client_types": {"$in": ["offer"]}},
                {"client_types": {"$nin": ["request"]}},
            ]
        }
    elif client_type == "request":
        query = {"owner_id": owner_id, "client_types": {"$in": ["request"]}}

    items: List[Dict[str, Any]] = []
    async for row in client_profile_collection.find(query).sort("_id", -1).limit(limit):
        items.append(client_profile_helper(row))
    return items


async def find_client_profile_by_name_db(
    owner_id: str, 
    client_name: str, 
    phone_number: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Find a client profile by name and phone number (case-insensitive).
    """
    query: Dict[str, Any] = {
        "owner_id": owner_id,
        "client_name": {"$regex": f"^{client_name}$", "$options": "i"}
    }
    if phone_number:
        query["phone_number"] = {"$regex": f"^{phone_number}$", "$options": "i"}
    
    found = await client_profile_collection.find_one(query)
    return client_profile_helper(found) if found else None


async def add_client_type_to_profile_db(
    owner_id: str, 
    profile_id: str, 
    client_type: str
) -> Optional[Dict[str, Any]]:
    """
    Add a client type to existing profile (merge types).
    """
    try:
        oid = ObjectId(profile_id)
    except InvalidId:
        return None
    
    # Get current profile to check existing types
    current = await client_profile_collection.find_one({"_id": oid, "owner_id": owner_id})
    if not current:
        return None
    
    current_types = current.get("client_types") or []
    if client_type == "request" and "offer" in current_types:
        return client_profile_helper(current)
    if client_type == "offer" and "request" in current_types:
        return client_profile_helper(current)
    if client_type not in current_types:
        current_types.append(client_type)
    
    updated = await client_profile_collection.find_one_and_update(
        {"_id": oid, "owner_id": owner_id},
        {"$set": {"client_types": current_types, "updated_at": datetime.utcnow()}},
        return_document=ReturnDocument.AFTER,
    )
    return client_profile_helper(updated) if updated else None


async def get_or_create_client_profile_with_type_db(
    owner_id: str, 
    client_name: str, 
    phone_number: Optional[str],
    client_type: str
) -> Dict[str, Any]:
    """
    Find existing client profile in the same "lane" as client_type, or create a new one.

    Request and offer lanes are isolated: same name + phone can have one profile for
    requests and a separate profile for offers (no merging across lanes).
    """
    safe_name = re.escape((client_name or "").strip())
    name_clause = {"client_name": {"$regex": f"^{safe_name}$", "$options": "i"}}
    base: Dict[str, Any] = {"owner_id": owner_id, **name_clause}
    if phone_number and str(phone_number).strip():
        safe_phone = re.escape(str(phone_number).strip())
        base["phone_number"] = {"$regex": f"^{safe_phone}$", "$options": "i"}

    # Only reuse a profile that already belongs to this lane (never merge request ↔ offer)
    if client_type == "offer":
        query: Dict[str, Any] = {
            "$and": [
                base,
                {"client_types": {"$in": ["offer"]}},
                {"client_types": {"$nin": ["request"]}},
            ]
        }
    elif client_type == "request":
        query = {
            "$and": [
                base,
                {"client_types": {"$in": ["request"]}},
                {"client_types": {"$nin": ["offer"]}},
            ]
        }
    else:
        query = {**base, "client_types": {"$in": [client_type]}}

    existing = await client_profile_collection.find_one(query)
    if existing:
        # Profile exists - merge the new client_type
        current_types = existing.get("client_types") or []
        if client_type not in current_types:
            current_types.append(client_type)
            await client_profile_collection.update_one(
                {"_id": existing["_id"]},
                {"$set": {"client_types": current_types, "updated_at": datetime.utcnow()}}
            )
        return client_profile_helper(existing)
    
    # Create new profile with the client_type
    now = datetime.utcnow()
    doc = {
        "owner_id": owner_id,
        "client_name": client_name,
        "phone_number": phone_number,
        "notes": "",
        "client_types": [client_type],
        "assigned_user_id": None,
        "assigned_user_name": None,
        "created_at": now,
        "updated_at": now,
    }
    result = await client_profile_collection.insert_one(doc)
    saved = await client_profile_collection.find_one({"_id": result.inserted_id})
    return client_profile_helper(saved or doc)


# ===== Historical Stats for Real Percentages =====


async def get_client_offers_stats_db(owner_id: str) -> Dict[str, Any]:
    """
    Get client offers statistics with percentage change (compared to 30 days ago).
    Returns current count and percentage change.
    """
    now = datetime.utcnow()
    thirty_days_ago = now - timedelta(days=30)
    
    # Current total offers count
    current_total = await client_offer_collection.count_documents({"owner_id": owner_id})
    
    # Count offers created in the last 30 days
    last_30_days_count = await client_offer_collection.count_documents({
        "owner_id": owner_id,
        "created_at": {"$gte": thirty_days_ago}
    })
    
    # Count offers created before 30 days ago (for comparison)
    before_30_days = await client_offer_collection.count_documents({
        "owner_id": owner_id,
        "created_at": {"$lt": thirty_days_ago}
    })
    
    # Calculate percentage change: new offers in last 30 days compared to total before 30 days
    if before_30_days > 0:
        percentage_change = round((last_30_days_count / before_30_days) * 100, 1)
    else:
        # If no offers before 30 days, calculate vs current (if there's any)
        percentage_change = round((last_30_days_count / max(current_total, 1)) * 100, 1) if current_total > 0 else 0
    
    # Active offers count (not closed)
    active_count = await client_offer_collection.count_documents({
        "owner_id": owner_id,
        "status": {"$ne": "closed"}
    })
    
    # Count active offers from 30 days ago
    active_before_30 = await client_offer_collection.count_documents({
        "owner_id": owner_id,
        "status": {"$ne": "closed"},
        "created_at": {"$lt": thirty_days_ago}
    })
    
    # Calculate active percentage change
    if active_before_30 > 0:
        active_percentage = round(((active_count - active_before_30) / active_before_30) * 100, 1)
    else:
        active_percentage = round((active_count / max(active_count, 1)) * 100, 1) if active_count > 0 else 0
    
    return {
        "total_offers": current_total,
        "active_offers": active_count,
        "new_last_30_days": last_30_days_count,
        "percentage_change": percentage_change,
        "active_percentage_change": active_percentage,
    }


async def get_client_requests_stats_db(owner_id: str) -> Dict[str, Any]:
    """
    Get client requests statistics with percentage change (compared to 30 days ago).
    Returns current count and percentage change.
    """
    now = datetime.utcnow()
    thirty_days_ago = now - timedelta(days=30)
    
    # Current total requests count
    current_total = await client_request_collection.count_documents({"owner_id": owner_id})
    
    # Count requests created in the last 30 days
    last_30_days_count = await client_request_collection.count_documents({
        "owner_id": owner_id,
        "created_at": {"$gte": thirty_days_ago}
    })
    
    # Count requests created before 30 days ago (for comparison)
    before_30_days = await client_request_collection.count_documents({
        "owner_id": owner_id,
        "created_at": {"$lt": thirty_days_ago}
    })
    
    # Calculate percentage change: new requests in last 30 days compared to total before 30 days
    if before_30_days > 0:
        percentage_change = round((last_30_days_count / before_30_days) * 100, 1)
    else:
        # If no requests before 30 days, calculate vs current (if there's any)
        percentage_change = round((last_30_days_count / max(current_total, 1)) * 100, 1) if current_total > 0 else 0
    
    # Active requests count (not closed)
    active_count = await client_request_collection.count_documents({
        "owner_id": owner_id,
        "status": {"$ne": "closed"}
    })
    
    # Count active requests from 30 days ago
    active_before_30 = await client_request_collection.count_documents({
        "owner_id": owner_id,
        "status": {"$ne": "closed"},
        "created_at": {"$lt": thirty_days_ago}
    })
    
    # Calculate active percentage change
    if active_before_30 > 0:
        active_percentage = round(((active_count - active_before_30) / active_before_30) * 100, 1)
    else:
        active_percentage = round((active_count / max(active_count, 1)) * 100, 1) if active_count > 0 else 0
    
    # New requests count (status = new)
    new_count = await client_request_collection.count_documents({
        "owner_id": owner_id,
        "status": "new"
    })
    
    # Count new requests from 30 days ago
    new_before_30 = await client_request_collection.count_documents({
        "owner_id": owner_id,
        "status": "new",
        "created_at": {"$lt": thirty_days_ago}
    })
    
    # Calculate new percentage change
    if new_before_30 > 0:
        new_percentage = round(((new_count - new_before_30) / new_before_30) * 100, 1)
    else:
        new_percentage = round((new_count / max(new_count, 1)) * 100, 1) if new_count > 0 else 0
    
    return {
        "total_requests": current_total,
        "active_requests": active_count,
        "new_requests": new_count,
        "new_last_30_days": last_30_days_count,
        "percentage_change": percentage_change,
        "active_percentage_change": active_percentage,
        "new_percentage_change": new_percentage,
    }


async def get_client_profiles_stats_db(owner_id: str) -> Dict[str, Any]:
    """
    Get client profiles statistics with percentage change (compared to 30 days ago).
    Returns current count and percentage change.
    """
    now = datetime.utcnow()
    thirty_days_ago = now - timedelta(days=30)
    
    # Current total profiles count
    current_total = await client_profile_collection.count_documents({"owner_id": owner_id})
    
    # Count profiles created in the last 30 days
    last_30_days_count = await client_profile_collection.count_documents({
        "owner_id": owner_id,
        "created_at": {"$gte": thirty_days_ago}
    })
    
    # Count profiles created before 30 days ago (for comparison)
    before_30_days = await client_profile_collection.count_documents({
        "owner_id": owner_id,
        "created_at": {"$lt": thirty_days_ago}
    })
    
    # Calculate percentage change: new profiles in last 30 days compared to total before 30 days
    if before_30_days > 0:
        percentage_change = round((last_30_days_count / before_30_days) * 100, 1)
    else:
        # If no profiles before 30 days, calculate vs current (if there's any)
        percentage_change = round((last_30_days_count / max(current_total, 1)) * 100, 1) if current_total > 0 else 0
    
    return {
        "total_clients": current_total,
        "new_last_30_days": last_30_days_count,
        "percentage_change": percentage_change,
    }


# ===== Appointments =====

appointment_collection = database.get_collection("appointments")


def appointment_helper(item: Dict[str, Any]) -> Dict[str, Any]:
    """Convert DB document to API response format."""
    _id = item.get("_id")
    return {
        "id": str(_id) if _id is not None else "",
        "type": item.get("type", "request"),
        "client_name": item.get("client_name", "غير محدد"),
        "phone_number": item.get("phone_number"),
        "property_type": item.get("property_type"),
        "city": item.get("city"),
        "neighborhood": item.get("neighborhood"),
        "property_id": item.get("property_id"),
        "reminder_type": item.get("reminder_type"),
        "deadline_at": item.get("deadline_at"),
        "reminder_before_minutes": int(item.get("reminder_before_minutes", 120) or 120),
        "follow_up_details": item.get("follow_up_details"),
        "status": item.get("status", "active"),
        "created_at": item.get("created_at") or datetime.utcnow(),
        "source_id": item.get("source_id"),
    }


async def create_appointment_db(owner_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new appointment from client request or offer."""
    doc = {
        "owner_id": owner_id,
        "type": payload.get("type", "request"),
        "client_name": payload.get("client_name", "غير محدد"),
        "phone_number": payload.get("phone_number"),
        "property_type": payload.get("property_type"),
        "city": payload.get("city"),
        "neighborhood": payload.get("neighborhood"),
        "property_id": payload.get("property_id"),
        "reminder_type": payload.get("reminder_type"),
        "deadline_at": payload.get("deadline_at"),
        "reminder_before_minutes": int(payload.get("reminder_before_minutes", 120) or 120),
        "follow_up_details": payload.get("follow_up_details"),
        "status": "active",
        "source_id": payload.get("source_id"),
        "created_at": datetime.utcnow(),
    }
    result = await appointment_collection.insert_one(doc)
    saved = await appointment_collection.find_one({"_id": result.inserted_id})
    return appointment_helper(saved or doc)


async def get_appointments_db(
    owner_id: str,
    limit: int = 200,
    date_filter: Optional[str] = None,
    employee_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Get appointments for an owner with optional filters."""
    query: Dict[str, Any] = {"owner_id": owner_id}
    
    # Filter by date
    if date_filter == "today":
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = today_start + timedelta(days=1)
        query["deadline_at"] = {"$gte": today_start, "$lt": today_end}
    elif date_filter == "this_week":
        today = datetime.utcnow().date()
        week_start = today - timedelta(days=today.weekday())
        week_end = week_start + timedelta(days=7)
        query["deadline_at"] = {
            "$gte": datetime.combine(week_start, datetime.min.time()),
            "$lt": datetime.combine(week_end, datetime.min.time())
        }
    elif date_filter == "delayed":
        query["deadline_at"] = {"$lt": datetime.utcnow()}
        query["status"] = "active"
    
    # Filter by employee
    if employee_id:
        query["assigned_user_id"] = employee_id
    
    items: List[Dict[str, Any]] = []
    async for row in appointment_collection.find(query).sort("deadline_at", 1).limit(limit):
        items.append(appointment_helper(row))
    return items


async def get_appointment_by_id_db(owner_id: str, appointment_id: str) -> Optional[Dict[str, Any]]:
    """Get an appointment by ID."""
    try:
        oid = ObjectId(appointment_id)
    except InvalidId:
        return None
    found = await appointment_collection.find_one({"_id": oid, "owner_id": owner_id})
    return appointment_helper(found) if found else None


async def update_appointment_db(
    owner_id: str, appointment_id: str, updates: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    """Update an appointment."""
    try:
        oid = ObjectId(appointment_id)
    except InvalidId:
        return None
    if not updates:
        found = await appointment_collection.find_one({"_id": oid, "owner_id": owner_id})
        return appointment_helper(found) if found else None
    updated = await appointment_collection.find_one_and_update(
        {"_id": oid, "owner_id": owner_id},
        {"$set": updates},
        return_document=ReturnDocument.AFTER,
    )
    return appointment_helper(updated) if updated else None


async def delete_appointment_db(owner_id: str, appointment_id: str) -> bool:
    """Delete an appointment."""
    try:
        oid = ObjectId(appointment_id)
    except InvalidId:
        return False
    result = await appointment_collection.delete_one({"_id": oid, "owner_id": owner_id})
    return result.deleted_count == 1


def marketing_lead_helper(item: Dict[str, Any]) -> Dict[str, Any]:
    _id = item.get("_id")
    return {
        "id": str(_id) if _id is not None else "",
        "owner_id": item.get("owner_id", ""),
        "property_id": item.get("property_id", ""),
        "name": item.get("name", ""),
        "phone": item.get("phone", ""),
        "notes": item.get("notes"),
        "request_type": item.get("request_type", "general"),
        "ad_source": item.get("ad_source", "direct"),
        "source_page": item.get("source_page", "landing_page"),
        "status": item.get("status", "new"),
        "visit_count": int(item.get("visit_count", 0) or 0),
        "clicked_whatsapp": bool(item.get("clicked_whatsapp", False)),
        "viewed_video": bool(item.get("viewed_video", False)),
        "watched_video": bool(item.get("watched_video", False)),
        "completed_video": bool(item.get("completed_video", False)),
        "submitted_form": bool(item.get("submitted_form", True)),
        "session_id": item.get("session_id"),
        "session_started_at": item.get("session_started_at"),
        "session_last_activity_at": item.get("session_last_activity_at"),
        "session_duration_seconds": int(item.get("session_duration_seconds", 0) or 0),
        "referrer": item.get("referrer"),
        "landing_url": item.get("landing_url"),
        "browser_name": item.get("browser_name"),
        "device_type": item.get("device_type"),
        "converted_to_client": bool(item.get("converted_to_client", False)),
        "converted_client_type": item.get("converted_client_type"),
        "converted_client_id": item.get("converted_client_id"),
        "created_at": item.get("created_at") or datetime.utcnow(),
        "updated_at": item.get("updated_at") or datetime.utcnow(),
    }


async def create_marketing_lead_db(owner_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    now = datetime.utcnow()
    doc = {
        "owner_id": owner_id,
        "property_id": payload.get("property_id", ""),
        "name": payload.get("name", ""),
        "phone": payload.get("phone", ""),
        "notes": payload.get("notes"),
        "request_type": payload.get("request_type", "general"),
        "ad_source": payload.get("ad_source", "direct"),
        "source_page": payload.get("source_page", "landing_page"),
        "status": "new",
        "visit_count": int(payload.get("visit_count", 0) or 0),
        "clicked_whatsapp": bool(payload.get("clicked_whatsapp", False)),
        "viewed_video": bool(payload.get("viewed_video", False)),
        "watched_video": bool(payload.get("watched_video", False)),
        "completed_video": bool(payload.get("completed_video", False)),
        "submitted_form": bool(payload.get("submitted_form", True)),
        "session_id": payload.get("session_id"),
        "session_started_at": payload.get("session_started_at"),
        "session_last_activity_at": payload.get("session_last_activity_at"),
        "session_duration_seconds": int(payload.get("session_duration_seconds", 0) or 0),
        "referrer": payload.get("referrer"),
        "landing_url": payload.get("landing_url"),
        "browser_name": payload.get("browser_name"),
        "device_type": payload.get("device_type"),
        "converted_to_client": False,
        "converted_client_type": None,
        "converted_client_id": None,
        "created_at": now,
        "updated_at": now,
    }
    result = await marketing_lead_collection.insert_one(doc)
    saved = await marketing_lead_collection.find_one({"_id": result.inserted_id})
    return marketing_lead_helper(saved or doc)


async def get_marketing_leads_db(owner_id: str, limit: int = 500) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    async for row in marketing_lead_collection.find({"owner_id": owner_id}).sort("_id", -1).limit(limit):
        rows.append(marketing_lead_helper(row))
    return rows


async def get_marketing_lead_by_id_db(owner_id: str, lead_id: str) -> Optional[Dict[str, Any]]:
    try:
        oid = ObjectId(lead_id)
    except InvalidId:
        return None
    found = await marketing_lead_collection.find_one({"_id": oid, "owner_id": owner_id})
    return marketing_lead_helper(found) if found else None


async def update_marketing_lead_db(owner_id: str, lead_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    try:
        oid = ObjectId(lead_id)
    except InvalidId:
        return None
    if not updates:
        found = await marketing_lead_collection.find_one({"_id": oid, "owner_id": owner_id})
        return marketing_lead_helper(found) if found else None
    updates["updated_at"] = datetime.utcnow()
    updated = await marketing_lead_collection.find_one_and_update(
        {"_id": oid, "owner_id": owner_id},
        {"$set": updates},
        return_document=ReturnDocument.AFTER,
    )
    return marketing_lead_helper(updated) if updated else None


async def create_marketing_event_db(owner_id: str, payload: Dict[str, Any]) -> None:
    doc = {
        "owner_id": owner_id,
        "property_id": payload.get("property_id", ""),
        "event_type": payload.get("event_type", "landing_visit"),
        "ad_source": payload.get("ad_source", "direct"),
        "session_id": payload.get("session_id"),
        "metadata": payload.get("metadata") or {},
        "created_at": datetime.utcnow(),
    }
    await marketing_event_collection.insert_one(doc)


async def get_marketing_session_signals_db(
    owner_id: str,
    property_id: str,
    session_id: Optional[str],
) -> Dict[str, Any]:
    base_query: Dict[str, Any] = {"owner_id": owner_id, "property_id": property_id}
    if session_id:
        base_query["session_id"] = session_id

    visit_count = await marketing_event_collection.count_documents({
        **base_query,
        "event_type": "landing_visit",
    })
    clicked_whatsapp = (
        await marketing_event_collection.count_documents({
            **base_query,
            "event_type": "cta_whatsapp_click",
        })
    ) > 0
    watched_video_complete = (
        await marketing_event_collection.count_documents({
            **base_query,
            "event_type": "video_complete",
        })
    ) > 0
    viewed_video = (
        await marketing_event_collection.count_documents({
            **base_query,
            "event_type": "video_view",
        })
    ) > 0

    first_event = await marketing_event_collection.find_one(
        base_query,
        sort=[("created_at", 1)],
    )
    last_event = await marketing_event_collection.find_one(
        base_query,
        sort=[("created_at", -1)],
    )

    duration_from_end = 0
    session_end_event = await marketing_event_collection.find_one(
        {
            **base_query,
            "event_type": "session_end",
        },
        sort=[("created_at", -1)],
    )
    if session_end_event:
        metadata = session_end_event.get("metadata") or {}
        try:
            duration_from_end = int(float(metadata.get("duration_seconds", 0) or 0))
        except Exception:
            duration_from_end = 0

    started_at = first_event.get("created_at") if first_event else None
    last_activity_at = last_event.get("created_at") if last_event else None
    fallback_duration = 0
    if started_at and last_activity_at:
        try:
            fallback_duration = max(0, int((last_activity_at - started_at).total_seconds()))
        except Exception:
            fallback_duration = 0

    metadata_source = (last_event or first_event or {}).get("metadata") or {}
    browser_name = metadata_source.get("browser")
    device_type = metadata_source.get("device")
    referrer = metadata_source.get("referrer")
    landing_url = metadata_source.get("landing_url")
    return {
        "visit_count": int(visit_count),
        "clicked_whatsapp": bool(clicked_whatsapp),
        "viewed_video": bool(viewed_video),
        "watched_video": bool(watched_video_complete),
        "completed_video": bool(watched_video_complete),
        "session_started_at": started_at,
        "session_last_activity_at": last_activity_at,
        "session_duration_seconds": max(duration_from_end, fallback_duration),
        "browser_name": browser_name,
        "device_type": device_type,
        "referrer": referrer,
        "landing_url": landing_url,
    }


def normalize_marketing_source(source: Optional[str], referrer: Optional[str] = None) -> str:
    value = (source or "").strip().lower()
    if not value and referrer:
        try:
            value = urlparse(referrer).hostname or ""
        except Exception:
            value = referrer
        value = value.strip().lower()

    if "tiktok" in value:
        return "tiktok"
    if "snap" in value:
        return "snapchat"
    if "insta" in value:
        return "instagram"
    if "youtu" in value:
        return "youtube"
    if "google" in value:
        return "google"
    if value in {"direct", "none", "(none)", "(direct)"}:
        return "direct"
    if not value:
        return "direct"
    return "unknown"


async def get_marketing_overview_db(owner_id: str) -> Dict[str, Any]:
    now = datetime.utcnow()
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    leads_today = await marketing_lead_collection.count_documents({"owner_id": owner_id, "created_at": {"$gte": day_start}})
    leads_month = await marketing_lead_collection.count_documents({"owner_id": owner_id, "created_at": {"$gte": month_start}})
    visits_count = await marketing_event_collection.count_documents({"owner_id": owner_id, "event_type": "landing_visit"})
    unique_visitors = len(
        await marketing_event_collection.distinct(
            "session_id",
            {"owner_id": owner_id, "event_type": "landing_visit", "session_id": {"$ne": None}},
        )
    )
    clicks_count = await marketing_event_collection.count_documents({
        "owner_id": owner_id,
        "event_type": {"$in": ["cta_whatsapp_click", "cta_call_click"]},
    })
    converted_count = await marketing_lead_collection.count_documents({"owner_id": owner_id, "converted_to_client": True})
    avg_session_duration_raw = await marketing_lead_collection.aggregate([
        {"$match": {"owner_id": owner_id}},
        {"$group": {"_id": None, "avg_duration": {"$avg": {"$ifNull": ["$session_duration_seconds", 0]}}}},
    ]).to_list(length=1)
    average_session_duration_seconds = int((avg_session_duration_raw[0].get("avg_duration", 0) if avg_session_duration_raw else 0) or 0)

    source_breakdown: Dict[str, int] = defaultdict(int)
    async for row in marketing_lead_collection.find({"owner_id": owner_id}, {"ad_source": 1}):
        source = normalize_marketing_source(str(row.get("ad_source") or ""))
        source_breakdown[source] += 1
    top_source = max(source_breakdown, key=source_breakdown.get) if source_breakdown else "direct"

    top_properties_map: Dict[str, int] = defaultdict(int)
    async for row in marketing_lead_collection.find({"owner_id": owner_id}, {"property_id": 1}):
        pid = str(row.get("property_id") or "")
        if pid:
            top_properties_map[pid] += 1
    top_properties = [
        {"property_id": pid, "leads": count}
        for pid, count in sorted(top_properties_map.items(), key=lambda item: item[1], reverse=True)[:5]
    ]

    conversion_rate = (converted_count / leads_month * 100) if leads_month else 0.0
    return {
        "leads_today": leads_today,
        "leads_month": leads_month,
        "conversion_rate": round(conversion_rate, 2),
        "clicks_count": clicks_count,
        "visits_count": visits_count,
        "unique_visitors_count": unique_visitors,
        "average_session_duration_seconds": average_session_duration_seconds,
        "top_source": top_source,
        "source_breakdown": dict(source_breakdown),
        "top_properties": top_properties,
    }


async def get_marketing_landing_pages_db(owner_id: str) -> List[Dict[str, Any]]:
    visits_map: Dict[str, int] = defaultdict(int)
    unique_sessions_per_property: Dict[str, set] = defaultdict(set)
    source_map: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
    async for ev in marketing_event_collection.find({"owner_id": owner_id, "event_type": "landing_visit"}, {"property_id": 1, "ad_source": 1}):
        pid = str(ev.get("property_id") or "")
        if not pid:
            continue
        visits_map[pid] += 1
        session_id = ev.get("session_id")
        if session_id:
            unique_sessions_per_property[pid].add(str(session_id))
        source = normalize_marketing_source(str(ev.get("ad_source") or ""))
        source_map[pid][source] += 1

    leads_map: Dict[str, int] = defaultdict(int)
    async for lead in marketing_lead_collection.find({"owner_id": owner_id}, {"property_id": 1}):
        pid = str(lead.get("property_id") or "")
        if pid:
            leads_map[pid] += 1

    property_ids = set(visits_map.keys()) | set(leads_map.keys())
    stats: List[Dict[str, Any]] = []
    for pid in property_ids:
        visits = visits_map.get(pid, 0)
        leads = leads_map.get(pid, 0)
        top_source = "direct"
        if source_map.get(pid):
            top_source = max(source_map[pid], key=source_map[pid].get)
        stats.append({
            "property_id": pid,
            "leads_count": leads,
            "visits_count": visits,
            "unique_visitors_count": len(unique_sessions_per_property.get(pid, set())),
            "conversion_rate": round((leads / visits * 100), 2) if visits else 0.0,
            "top_source": top_source,
        })
    stats.sort(key=lambda x: x.get("leads_count", 0), reverse=True)
    return stats


async def get_marketing_landing_page_details_db(owner_id: str, property_id: str) -> Dict[str, Any]:
    base_query = {"owner_id": owner_id, "property_id": property_id}

    visits_count = await marketing_event_collection.count_documents({**base_query, "event_type": "landing_visit"})
    unique_visitors_count = len(
        await marketing_event_collection.distinct(
            "session_id",
            {**base_query, "event_type": "landing_visit", "session_id": {"$ne": None}},
        )
    )
    leads_count = await marketing_lead_collection.count_documents(base_query)
    conversion_rate = round((leads_count / visits_count * 100), 2) if visits_count else 0.0

    source_visits: Dict[str, int] = defaultdict(int)
    source_clicks: Dict[str, int] = defaultdict(int)
    source_leads: Dict[str, int] = defaultdict(int)

    async for ev in marketing_event_collection.find(
        {**base_query, "event_type": "landing_visit"},
        {"ad_source": 1, "metadata": 1},
    ):
        metadata = ev.get("metadata") or {}
        source_key = normalize_marketing_source(
            str(ev.get("ad_source") or metadata.get("source") or ""),
            metadata.get("referrer"),
        )
        source_visits[source_key] += 1

    async for ev in marketing_event_collection.find(
        {**base_query, "event_type": {"$in": ["cta_whatsapp_click", "cta_call_click", "cta_primary_click"]}},
        {"ad_source": 1, "metadata": 1},
    ):
        metadata = ev.get("metadata") or {}
        source_key = normalize_marketing_source(
            str(ev.get("ad_source") or metadata.get("source") or ""),
            metadata.get("referrer"),
        )
        source_clicks[source_key] += 1

    async for lead in marketing_lead_collection.find(
        base_query,
        {"ad_source": 1, "referrer": 1},
    ):
        source_key = normalize_marketing_source(
            str(lead.get("ad_source") or ""),
            str(lead.get("referrer") or ""),
        )
        source_leads[source_key] += 1

    source_order = ["tiktok", "snapchat", "instagram", "youtube", "google", "direct", "unknown"]
    observed_sources = set(source_visits.keys()) | set(source_clicks.keys()) | set(source_leads.keys())
    traffic_sources: List[Dict[str, Any]] = []
    for source_key in source_order + sorted([s for s in observed_sources if s not in source_order]):
        if source_key not in observed_sources:
            continue
        visits = int(source_visits.get(source_key, 0))
        leads = int(source_leads.get(source_key, 0))
        traffic_sources.append({
            "source": source_key,
            "visits": visits,
            "clicks": int(source_clicks.get(source_key, 0)),
            "leads": leads,
            "conversion_rate": round((leads / visits * 100), 2) if visits else 0.0,
        })

    cta_breakdown = {
        "whatsapp_clicks": await marketing_event_collection.count_documents({**base_query, "event_type": "cta_whatsapp_click"}),
        "call_clicks": await marketing_event_collection.count_documents({**base_query, "event_type": "cta_call_click"}),
        "video_views": await marketing_event_collection.count_documents({**base_query, "event_type": "video_view"}),
        "form_views": await marketing_event_collection.count_documents({**base_query, "event_type": "form_view"}),
        "form_submits": await marketing_event_collection.count_documents({**base_query, "event_type": "form_submit"}),
    }

    funnel = [
        {"label": "زيارات", "value": int(visits_count)},
        {"label": "ضغط واتساب", "value": int(cta_breakdown["whatsapp_clicks"])},
        {"label": "فتح الفورم", "value": int(cta_breakdown["form_views"])},
        {"label": "Leads", "value": int(leads_count)},
    ]

    raw_events = await marketing_event_collection.find(
        base_query,
        {"session_id": 1, "event_type": 1, "created_at": 1, "ad_source": 1, "metadata": 1},
    ).sort("created_at", -1).limit(1200).to_list(length=1200)

    sessions: Dict[str, Dict[str, Any]] = {}
    for index, ev in enumerate(raw_events):
        event_type = str(ev.get("event_type") or "landing_visit")
        created_at = ev.get("created_at") or datetime.utcnow()
        metadata = ev.get("metadata") or {}
        raw_session_id = ev.get("session_id")
        session_key = str(raw_session_id) if raw_session_id else f"anon-{index}"
        source_key = normalize_marketing_source(
            str(ev.get("ad_source") or metadata.get("source") or ""),
            metadata.get("referrer"),
        )

        if session_key not in sessions:
            sessions[session_key] = {
                "first_at": created_at,
                "last_at": created_at,
                "last_event_type": event_type,
                "source": source_key,
                "device": str(metadata.get("device") or "unknown"),
                "duration_seconds": 0,
            }
        else:
            sessions[session_key]["first_at"] = min(sessions[session_key]["first_at"], created_at)
            sessions[session_key]["last_at"] = max(sessions[session_key]["last_at"], created_at)

        if created_at >= sessions[session_key]["last_at"]:
            sessions[session_key]["last_event_type"] = event_type
            sessions[session_key]["source"] = source_key
            sessions[session_key]["device"] = str(metadata.get("device") or sessions[session_key]["device"] or "unknown")

        if event_type == "session_end":
            try:
                sessions[session_key]["duration_seconds"] = max(
                    int(float(metadata.get("duration_seconds", 0) or 0)),
                    int(sessions[session_key]["duration_seconds"] or 0),
                )
            except Exception:
                pass

    session_activity: List[Dict[str, Any]] = []
    durations: List[int] = []
    for data in sessions.values():
        fallback_duration = max(0, int((data["last_at"] - data["first_at"]).total_seconds()))
        duration_seconds = max(int(data.get("duration_seconds", 0) or 0), fallback_duration)
        if duration_seconds > 0:
            durations.append(duration_seconds)
        session_activity.append({
            "source": data.get("source", "unknown"),
            "activity": data.get("last_event_type", "landing_visit"),
            "session_duration_seconds": duration_seconds,
            "happened_at": data.get("last_at") or datetime.utcnow(),
            "device_type": data.get("device", "unknown"),
        })

    session_activity.sort(key=lambda item: item.get("happened_at") or datetime.utcnow(), reverse=True)
    average_session_duration_seconds = int(sum(durations) / len(durations)) if durations else 0

    return {
        "property_id": property_id,
        "visits_count": int(visits_count),
        "unique_visitors_count": int(unique_visitors_count),
        "average_session_duration_seconds": int(average_session_duration_seconds),
        "leads_count": int(leads_count),
        "conversion_rate": float(conversion_rate),
        "traffic_sources": traffic_sources,
        "cta_breakdown": cta_breakdown,
        "funnel": funnel,
        "session_activity": session_activity[:20],
    }


async def get_marketing_analytics_db(owner_id: str) -> Dict[str, Any]:
    now = datetime.utcnow()
    daily_map: Dict[str, int] = defaultdict(int)
    weekly_map: Dict[str, int] = defaultdict(int)
    monthly_map: Dict[str, int] = defaultdict(int)
    source_breakdown: Dict[str, int] = defaultdict(int)
    cta_breakdown: Dict[str, int] = defaultdict(int)

    async for lead in marketing_lead_collection.find({"owner_id": owner_id}, {"created_at": 1, "ad_source": 1, "request_type": 1}):
        created = lead.get("created_at") or now
        day_key = created.strftime("%Y-%m-%d")
        week_key = f"{created.strftime('%Y')}-W{created.strftime('%W')}"
        month_key = created.strftime("%Y-%m")
        daily_map[day_key] += 1
        weekly_map[week_key] += 1
        monthly_map[month_key] += 1
        source_breakdown[normalize_marketing_source(str(lead.get("ad_source") or ""))] += 1
    async for ev in marketing_event_collection.find(
        {"owner_id": owner_id, "event_type": {"$in": ["cta_whatsapp_click", "cta_call_click", "cta_primary_click"]}},
        {"event_type": 1, "metadata": 1},
    ):
        if ev.get("event_type") == "cta_whatsapp_click":
            cta_breakdown["whatsapp"] += 1
        elif ev.get("event_type") == "cta_call_click":
            cta_breakdown["call"] += 1
        else:
            metadata = ev.get("metadata") or {}
            cta_key = str(metadata.get("cta_key") or "primary")
            cta_breakdown[cta_key] += 1

    daily_leads = [{"period": key, "count": value} for key, value in sorted(daily_map.items())]
    weekly_leads = [{"period": key, "count": value} for key, value in sorted(weekly_map.items())]
    monthly_leads = [{"period": key, "count": value} for key, value in sorted(monthly_map.items())]

    return {
        "daily_leads": daily_leads,
        "weekly_leads": weekly_leads,
        "monthly_leads": monthly_leads,
        "source_breakdown": dict(source_breakdown),
        "cta_breakdown": dict(cta_breakdown),
    }
