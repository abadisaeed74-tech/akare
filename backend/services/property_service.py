import re
from datetime import datetime
from typing import Dict, List, Optional

from fastapi import HTTPException
from bson import ObjectId
from bson.errors import InvalidId

from ai_processor import process_real_estate_text
from config import AI_DAILY_ANALYSIS_LIMIT
from database import (
    add_property,
    consume_company_daily_ai_quota,
    count_properties_for_owner,
    delete_properties_by_city,
    delete_properties_by_neighborhood,
    delete_property_by_raw_text,
    delete_property_db,
    get_assigned_offer_property_ids,
    get_all_cities,
    get_all_neighborhoods,
    get_or_create_company_for_owner,
    get_properties,
    get_property_by_id,
    update_company_billing_from_stripe,
    update_property_db,
)
from models import Property, PropertyInput, PropertyUpdate, UserPublic
from services.notification_service import create_owner_team_notification
from utils.helpers import (
    normalize_city,
    normalize_external_url,
    normalize_media_path,
    normalize_neighborhood,
)
from utils.permissions import has_permission, normalize_permissions, require_permission

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
        "price_monthly_sar": 199.0,
    },
    "enterprise": {
        "key": "enterprise",
        "name": "خطة الشركات",
        "max_users": 50,
        "max_properties": 5000,
        "max_storage_mb": 102400,
        "allow_custom_subdomain": True,
        "price_monthly_sar": 599.0,
    },
}


def get_plan(key: str) -> Dict:
    return PLANS.get(key, PLANS["starter"])


async def refresh_trial_subscription_state(owner_user_id: str) -> Dict:
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
    if not owner_user_id:
        return False
    company = await refresh_trial_subscription_state(owner_user_id)
    return bool(company.get("is_subscribed", False))


def _owner_id_for_user(current_user: UserPublic) -> Optional[str]:
    return current_user.id if current_user.role == "owner" else current_user.company_owner_id


async def _property_scope_query(current_user: UserPublic, owner_id: Optional[str]) -> dict:
    if not owner_id:
        return {"owner_id": "__none__"}
    query: dict = {"owner_id": owner_id}
    if current_user.role == "owner":
        return query
    perms = normalize_permissions(current_user.role or "employee", current_user.permissions or {})
    if perms.get("can_view_all_properties", False):
        return query
    if perms.get("can_view_assigned_only", True):
        visible_or: List[dict] = [
            {"assigned_user_id": current_user.id},
            {"created_by_user_id": current_user.id},
        ]
        linked_offer_property_ids = await get_assigned_offer_property_ids(owner_id, current_user.id or "")
        linked_offer_object_ids: List[ObjectId] = []
        for property_id in linked_offer_property_ids:
            try:
                linked_offer_object_ids.append(ObjectId(property_id))
            except (InvalidId, TypeError):
                continue
        if linked_offer_object_ids:
            visible_or.append({"_id": {"$in": linked_offer_object_ids}})
        query["$or"] = visible_or
        return query
    return {"owner_id": "__none__"}


async def create_property_service(property_input: PropertyInput, current_user: UserPublic) -> Property:
    require_permission(current_user, "can_add_property")
    owner_id_for_plan = _owner_id_for_user(current_user)
    if not owner_id_for_plan:
        raise HTTPException(status_code=400, detail="لا يمكن تحديد شركة الحساب الحالي.")

    company_for_plan = await refresh_trial_subscription_state(owner_id_for_plan)
    if not company_for_plan.get("is_subscribed", False):
        raise HTTPException(
            status_code=403,
            detail="لا يمكنك إضافة عروض جديدة قبل الاشتراك في إحدى الخطط. يرجى التوجه إلى صفحة الإعدادات لاختيار خطة مناسبة.",
        )

    if property_input.input_mode == "manual":
        if not property_input.property_type or not property_input.city:
            raise HTTPException(status_code=422, detail="نوع العقار والمدينة مطلوبة عند الإضافة اليدوية.")

        raw_parts = [
            property_input.property_type,
            property_input.neighborhood,
            property_input.city,
            f"المساحة {property_input.area}م²" if property_input.area else None,
            f"السعر {property_input.price} ر.س" if property_input.price else None,
            property_input.details,
        ]
        generated_raw_text = " - ".join(str(part).strip() for part in raw_parts if part)
        processed_data = {
            "city": property_input.city,
            "neighborhood": property_input.neighborhood or "غير مذكور",
            "property_type": property_input.property_type,
            "area": property_input.area or 0.0,
            "price": property_input.price or 0.0,
            "details": property_input.details or "غير مذكور",
            "owner_name": property_input.owner_name or "غير مذكور",
            "owner_contact_number": property_input.owner_contact_number or "غير مذكور",
            "marketer_contact_number": property_input.marketer_contact_number or "غير مذكور",
            "formatted_description": property_input.formatted_description or property_input.details or generated_raw_text,
            "region_within_city": property_input.region_within_city or "غير مذكور",
        }
        property_input.raw_text = property_input.raw_text or generated_raw_text
    else:
        if not property_input.raw_text.strip():
            raise HTTPException(status_code=422, detail="الرجاء إدخال نص العرض.")

        quota = await consume_company_daily_ai_quota(owner_id_for_plan, AI_DAILY_ANALYSIS_LIMIT)
        if not quota.get("allowed"):
            await create_owner_team_notification(
                owner_id=owner_id_for_plan,
                type="ai_limit_reached",
                category="ai",
                title="تم الوصول للحد اليومي للذكاء الاصطناعي",
                message=f"تم استهلاك الحد اليومي ({quota.get('limit')}) لتحليل الذكاء الاصطناعي.",
                priority="high",
                link="/settings?section=plans",
            )
            raise HTTPException(
                status_code=429,
                detail=(
                    f"تم تجاوز الحد اليومي لتحليل الذكاء الاصطناعي ({quota.get('limit')} تحليل/يوم) "
                    "لهذا الحساب. حاول مرة أخرى غدًا."
                ),
            )
        if quota.get("remaining", 0) <= 3:
            await create_owner_team_notification(
                owner_id=owner_id_for_plan,
                type="ai_limit_near",
                category="ai",
                title="الاقتراب من الحد اليومي للذكاء الاصطناعي",
                message=f"المتبقي {quota.get('remaining')} فقط من عمليات التحليل اليومي.",
                link="/settings?section=plans",
            )
        processed_data = process_real_estate_text(property_input.raw_text, api_key=None)

    if not processed_data or "error" in processed_data:
        details = str((processed_data or {}).get("details", ""))
        if (
            "RESOURCE_EXHAUSTED" in details
            or "PERMISSION_DENIED" in details
            or "reported as leaked" in details
            or "UNAVAILABLE" in details
            or "503" in details
            or "high demand" in details
        ):
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
    processed_data["images"] = [normalize_media_path(v) for v in (property_input.images or []) if isinstance(v, str)]
    processed_data["videos"] = [normalize_media_path(v) for v in (property_input.videos or []) if isinstance(v, str)]
    processed_data["documents"] = [normalize_media_path(v) for v in (property_input.documents or []) if isinstance(v, str)]
    processed_data["map_url"] = normalize_external_url(property_input.map_url)

    for numeric_field in ("area", "price"):
        value = processed_data.get(numeric_field)
        if value is None:
            processed_data[numeric_field] = 0.0
        else:
            try:
                processed_data[numeric_field] = float(value)
            except (TypeError, ValueError):
                processed_data[numeric_field] = 0.0

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

    processed_data["city"] = normalize_city(processed_data.get("city"))
    processed_data["neighborhood"] = normalize_neighborhood(processed_data.get("neighborhood"))
    try:
        property_data = Property(**processed_data)
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail="AI returned invalid data for the property fields; please try rephrasing the text.",
        ) from exc

    owner_id = current_user.id
    if current_user.role != "owner":
        if not current_user.company_owner_id:
            raise HTTPException(status_code=400, detail="لا يمكن تحديد مالك الشركة لهذا المستخدم.")
        owner_id = current_user.company_owner_id

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

    new_property = await add_property(
        property_data,
        owner_id,
        created_by_user_id=current_user.id if current_user.role != "owner" else None,
    )
    await create_owner_team_notification(
        owner_id=owner_id,
        type="property_created",
        category="properties",
        title="إضافة عقار جديد",
        message=f"تمت إضافة عرض جديد في {new_property.get('city') or 'المدينة'}.",
        link="/app?section=properties",
        metadata={"property_id": str(new_property.get("id") or "")},
    )
    return Property(**new_property)


async def update_property_service(property_id: str, updates: PropertyUpdate, current_user: UserPublic) -> Property:
    require_permission(current_user, "can_edit_property")
    existing = await get_property_by_id(property_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Property not found")

    owner_id_for_user = _owner_id_for_user(current_user)
    if not owner_id_for_user or existing.get("owner_id") != owner_id_for_user:
        raise HTTPException(status_code=404, detail="Property not found")
    if current_user.role != "owner" and not has_permission(current_user, "can_view_all_properties"):
        is_own = existing.get("created_by_user_id") == current_user.id
        is_assigned = existing.get("assigned_user_id") == current_user.id
        if not (is_own or is_assigned):
            raise HTTPException(status_code=403, detail="لا تملك صلاحية تعديل هذا العقار.")

    update_data = updates.model_dump(exclude_unset=True)
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

    if "city" in update_data:
        update_data["city"] = normalize_city(update_data.get("city"))
    if "neighborhood" in update_data:
        update_data["neighborhood"] = normalize_neighborhood(update_data.get("neighborhood"))
    if "map_url" in update_data:
        update_data["map_url"] = normalize_external_url(update_data.get("map_url"))
    for media_field in ("images", "videos", "documents"):
        if media_field in update_data and isinstance(update_data.get(media_field), list):
            update_data[media_field] = [
                normalize_media_path(v) for v in (update_data.get(media_field) or []) if isinstance(v, str)
            ]

    updated = await update_property_db(property_id, update_data)
    if not updated:
        raise HTTPException(status_code=404, detail="Property not found")
    if owner_id_for_user:
        await create_owner_team_notification(
            owner_id=owner_id_for_user,
            type="property_updated",
            category="properties",
            title="تعديل عقار",
            message=f"تم تعديل بيانات العقار {updated.get('property_code') or ''}.",
            link="/app?section=properties",
            metadata={"property_id": str(updated.get("id") or property_id)},
        )
    return Property(**updated)


async def delete_property_service(property_id: str, current_user: UserPublic) -> None:
    require_permission(current_user, "can_delete_property")
    existing = await get_property_by_id(property_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Property not found")

    owner_id_for_user = _owner_id_for_user(current_user)
    if not owner_id_for_user or existing.get("owner_id") != owner_id_for_user:
        raise HTTPException(status_code=404, detail="Property not found")
    if current_user.role != "owner" and not has_permission(current_user, "can_view_all_properties"):
        is_own = existing.get("created_by_user_id") == current_user.id
        is_assigned = existing.get("assigned_user_id") == current_user.id
        if not (is_own or is_assigned):
            raise HTTPException(status_code=403, detail="لا تملك صلاحية حذف هذا العقار.")

    deleted = await delete_property_db(property_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Property not found")
    if owner_id_for_user:
        await create_owner_team_notification(
            owner_id=owner_id_for_user,
            type="property_deleted",
            category="properties",
            title="حذف عقار",
            message="تم حذف عرض عقاري من المنصة.",
            link="/app?section=properties",
            metadata={"property_id": property_id},
        )


async def delete_property_by_raw_text_service(raw_text: str, current_user: UserPublic) -> None:
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="فقط مالك الحساب يمكنه استخدام هذا النوع من الحذف.")
    deleted = await delete_property_by_raw_text(raw_text)
    if not deleted:
        raise HTTPException(status_code=404, detail="Property not found")


async def delete_properties_by_city_service(city: str, current_user: UserPublic) -> None:
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="فقط مالك الحساب يمكنه حذف جميع العروض في مدينة.")
    await delete_properties_by_city(city, current_user.id)


async def delete_properties_by_neighborhood_service(
    neighborhood: str,
    city: Optional[str],
    current_user: UserPublic,
) -> None:
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="فقط مالك الحساب يمكنه حذف جميع العروض في حي.")
    await delete_properties_by_neighborhood(city, neighborhood, current_user.id)


async def list_properties_service(
    city: Optional[str],
    neighborhood: Optional[str],
    property_type: Optional[str],
    min_area: Optional[float],
    max_area: Optional[float],
    min_price: Optional[float],
    max_price: Optional[float],
    current_user: UserPublic,
) -> List[Property]:
    owner_id = _owner_id_for_user(current_user)
    if not await can_view_company_properties(owner_id):
        return []
    query: Dict[str, object] = await _property_scope_query(current_user, owner_id)
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

    rows = await get_properties(query)
    return [Property(**row) for row in rows]


async def list_cities_service(current_user: UserPublic) -> List[str]:
    owner_id = _owner_id_for_user(current_user)
    if not await can_view_company_properties(owner_id):
        return []
    if current_user.role == "owner" or has_permission(current_user, "can_view_all_properties"):
        return await get_all_cities(owner_id)
    rows = await get_properties(await _property_scope_query(current_user, owner_id), limit=1000)
    return sorted({str(r.get("city") or "").strip() for r in rows if str(r.get("city") or "").strip()})


async def list_neighborhoods_service(city: Optional[str], current_user: UserPublic) -> List[str]:
    owner_id = _owner_id_for_user(current_user)
    if not await can_view_company_properties(owner_id):
        return []
    if current_user.role == "owner" or has_permission(current_user, "can_view_all_properties"):
        return await get_all_neighborhoods(owner_id, city)
    query = await _property_scope_query(current_user, owner_id)
    if city:
        query["city"] = city
    rows = await get_properties(query, limit=1000)
    return sorted(
        {
            str(r.get("neighborhood") or "").strip()
            for r in rows
            if str(r.get("neighborhood") or "").strip()
        }
    )


async def search_properties_service(q: str, current_user: UserPublic) -> List[Property]:
    search_query = {
        "$or": [
            {"property_code": {"$regex": q, "$options": "i"}},
            {"city": {"$regex": q, "$options": "i"}},
            {"neighborhood": {"$regex": q, "$options": "i"}},
            {"details": {"$regex": q, "$options": "i"}},
            {"owner_name": {"$regex": q, "$options": "i"}},
            {"owner_contact_number": {"$regex": q, "$options": "i"}},
            {"marketer_contact_number": {"$regex": q, "$options": "i"}},
            {"contact_number": {"$regex": q, "$options": "i"}},
            {"raw_text": {"$regex": q, "$options": "i"}},
        ]
    }
    owner_id = _owner_id_for_user(current_user)
    if not await can_view_company_properties(owner_id):
        return []
    scope = await _property_scope_query(current_user, owner_id)
    if "$or" in scope:
        search_query["$and"] = [{"$or": search_query["$or"]}, {"$or": scope["$or"]}]
        search_query.pop("$or", None)
    search_query["owner_id"] = owner_id
    rows = await get_properties(search_query)
    return [Property(**row) for row in rows]


async def ai_search_properties_service(q: str, current_user: UserPublic) -> List[Property]:
    text = q.strip()
    query: Dict[str, object] = {}
    owner_id_for_user = _owner_id_for_user(current_user)
    if not await can_view_company_properties(owner_id_for_user):
        return []
    try:
        cities = await get_all_cities(owner_id_for_user) if owner_id_for_user else []
    except Exception:
        cities = []

    if isinstance(cities, list):
        for c in cities:
            if isinstance(c, str) and c and c in text:
                query["city"] = normalize_city(c)
                break

    if "أرض" in text or "ارض" in text:
        query["property_type"] = {"$regex": "أرض", "$options": "i"}
    elif "فيلا" in text or "فيلا" in text:
        query["property_type"] = "فيلا"
    elif "عمارة" in text or "عماره" in text:
        query["property_type"] = "عمارة"

    m = re.search(r"(\d+)\s*(متر|م)", text)
    if m:
        area = float(m.group(1))
        query["area"] = {"$gte": area * 0.8, "$lte": area * 1.2}

    if query:
        query["owner_id"] = owner_id_for_user
        scope = await _property_scope_query(current_user, owner_id_for_user)
        if "$or" in scope:
            query["$and"] = [{"$or": scope["$or"]}]
        properties = await get_properties(query)
        if properties:
            return [Property(**row) for row in properties]
    return await search_properties_service(q, current_user)
