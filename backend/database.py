import os
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from dotenv import load_dotenv
import motor.motor_asyncio
from bson import ObjectId
from bson.errors import InvalidId
from pymongo import ReturnDocument
from models import Property, UserPublic

load_dotenv()

MONGO_DETAILS = os.getenv("MONGO_DETAILS")
if not MONGO_DETAILS:
    raise ValueError("MONGO_DETAILS not found in .env file. Please add it.")

client = motor.motor_asyncio.AsyncIOMotorClient(MONGO_DETAILS)
database = client.akare
property_collection = database.get_collection("properties")
user_collection = database.get_collection("users")
company_collection = database.get_collection("companies")

# Helper to convert document from DB
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
        "region_within_city": property.get("region_within_city"),
        "images": property.get("images", []),
        "videos": property.get("videos", []),
        "documents": property.get("documents", []),
        "map_url": property.get("map_url"),
    }

async def add_property(property_data: Property, owner_id: str) -> dict:
    """
    Add a new property to the database.
    """
    # Exclude None values so that `_id` is not sent as null and MongoDB
    # can generate a proper ObjectId automatically.
    property_dict = property_data.model_dump(by_alias=True, exclude_none=True)
    property_dict["owner_id"] = owner_id
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


async def delete_property_by_raw_text(raw_text: str) -> bool:
    """
    Fallback delete for legacy documents that may not have a valid ObjectId.
    Deletes a single document matching the given raw_text.
    """
    result = await property_collection.delete_one({"raw_text": raw_text})
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
    async for prop in property_collection.find(query).limit(limit):
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
    return {
        "id": str(_id) if _id is not None else None,
        "email": user.get("email"),
        "gemini_api_key": user.get("gemini_api_key"),
        "role": role,
        "status": status,
        "company_owner_id": user.get("company_owner_id") or (str(_id) if _id is not None else None),
        "permissions": user.get("permissions") or {},
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


async def update_employee_user(owner_user_id: str, user_id: str, updates: Dict[str, Any]) -> Optional[dict]:
    """
    Update an employee that belongs to a given owner (company). Owners cannot
    be demoted/updated through this function; it's for employees only.
    """
    try:
        oid = ObjectId(user_id)
    except InvalidId:
        return None

    allowed_fields = {"status", "permissions"}
    update_doc: Dict[str, Any] = {k: v for k, v in updates.items() if k in allowed_fields}
    if not update_doc:
        user = await user_collection.find_one({"_id": oid})
        return user_helper(user) if user else None

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
) -> dict:
    """
    Create a new employee user under the given owner.
    """
    default_permissions = {
        "can_add_property": True,
        "can_edit_property": True,
        "can_delete_property": False,
        "can_manage_files": True,
    }
    perms = permissions or default_permissions
    return await create_user(
        email=email,
        password_hash=password_hash,
        gemini_api_key=None,
        role="employee",
        company_owner_id=owner_user_id,
        status="active",
        permissions=perms,
    )


# ===== Company helpers =====

def company_helper(company: Dict[str, Any]) -> dict:
    if not company:
        return {}
    _id = company.get("_id")
    return {
        "id": str(_id) if _id is not None else None,
        "owner_user_id": company.get("owner_user_id"),
        "company_name": company.get("company_name"),
        "logo_url": company.get("logo_url"),
        "official_email": company.get("official_email"),
        "contact_phone": company.get("contact_phone"),
        "subdomain": company.get("subdomain"),
        "plan_key": company.get("plan_key", "starter"),
        "is_subscribed": company.get("is_subscribed", False),
        "subscription_started_at": company.get("subscription_started_at"),
        "subscription_ends_at": company.get("subscription_ends_at"),
        "billing_status": company.get("billing_status"),
        "cancel_at_period_end": company.get("cancel_at_period_end", False),
        "trial_used": company.get("trial_used", False),
        "stripe_customer_id": company.get("stripe_customer_id"),
        "stripe_subscription_id": company.get("stripe_subscription_id"),
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

