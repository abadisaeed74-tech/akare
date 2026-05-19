import re
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException

from ai_processor import process_client_request_text
from database import (
    create_client_note_db,
    create_client_offer_db,
    create_client_offer_note_db,
    create_client_profile_db,
    create_client_request_db,
    delete_client_note_db,
    delete_client_offer_db,
    delete_client_offer_note_db,
    delete_client_profile_db,
    delete_client_request_db,
    get_client_notes_db,
    get_client_offer_by_id_db,
    get_client_offer_notes_db,
    get_client_offers_by_client_db,
    get_client_offers_db,
    get_client_offers_stats_db,
    get_client_profile_by_id_db,
    get_client_profiles_by_type_db,
    get_client_profiles_db,
    get_client_profiles_stats_db,
    get_client_request_by_id_db,
    get_client_requests_db,
    get_client_requests_stats_db,
    get_or_create_client_profile_with_type_db,
    get_properties,
    get_user_by_id,
    get_property_by_id,
    update_client_note_db,
    update_client_offer_db,
    update_client_offer_note_db,
    update_client_profile_db,
    update_client_request_db,
)
from models import (
    ClientNoteInput,
    ClientNotePublic,
    ClientNoteUpdate,
    ClientOfferInput,
    ClientOfferPublic,
    ClientOfferUpdate,
    ClientProfileInput,
    ClientProfilePublic,
    ClientProfileUpdate,
    ClientRequestInput,
    ClientRequestPublic,
    ClientRequestUpdate,
    Property,
    UserPublic,
)
from services.notification_service import create_notification, create_owner_team_notification
from utils.helpers import normalize_city, normalize_neighborhood
from utils.permissions import has_permission, require_permission


def _owner_id(current_user: UserPublic) -> Optional[str]:
    return current_user.id if current_user.role == "owner" else current_user.company_owner_id


def _client_key(name: Optional[str], phone: Optional[str]) -> str:
    return f"{(name or 'غير محدد').strip()}|{(phone or '').strip()}"


async def _assigned_client_keys(owner_id: str, user_id: str) -> set[str]:
    requests = await get_client_requests_db(owner_id, limit=1000)
    offers = await get_client_offers_db(owner_id, limit=1000)
    return {
        _client_key(item.get("client_name"), item.get("phone_number"))
        for item in [*requests, *offers]
        if item.get("assigned_user_id") == user_id
    }


async def _can_access_client_record(owner_id: str, current_user: UserPublic, client_name: Optional[str], phone_number: Optional[str]) -> bool:
    if current_user.role == "owner":
        return True
    if has_permission(current_user, "can_view_all_clients"):
        return True
    if has_permission(current_user, "can_view_own_clients_only"):
        keys = await _assigned_client_keys(owner_id, current_user.id or "")
        return _client_key(client_name, phone_number) in keys
    return False


def _item_assignee(item: Dict[str, Any]) -> Tuple[Optional[str], Optional[str]]:
    return item.get("assigned_user_id"), item.get("assigned_user_name")


def _is_visible_item(item: Dict[str, Any], current_user: UserPublic) -> bool:
    if current_user.role == "owner" or has_permission(current_user, "can_view_all_clients"):
        return True
    if not has_permission(current_user, "can_view_own_clients_only"):
        return False
    assigned_user_id, _ = _item_assignee(item)
    return bool(assigned_user_id and assigned_user_id == current_user.id)


async def _legacy_assignment_maps(owner_id: str) -> tuple[dict[str, tuple[Optional[str], Optional[str]]], dict[str, tuple[Optional[str], Optional[str]]]]:
    profiles = await get_client_profiles_db(owner_id, limit=5000)
    by_profile_id: dict[str, tuple[Optional[str], Optional[str]]] = {}
    by_identity: dict[str, tuple[Optional[str], Optional[str]]] = {}
    for profile in profiles:
        assigned = (profile.get("assigned_user_id"), profile.get("assigned_user_name"))
        if profile.get("id"):
            by_profile_id[profile["id"]] = assigned
        by_identity[_client_key(profile.get("client_name"), profile.get("phone_number"))] = assigned
    return by_profile_id, by_identity


LegacyAssignmentMaps = tuple[
    dict[str, tuple[Optional[str], Optional[str]]],
    dict[str, tuple[Optional[str], Optional[str]]],
]


async def _ensure_request_assignment(
    owner_id: str,
    item: Dict[str, Any],
    legacy_maps: Optional[LegacyAssignmentMaps] = None,
) -> Dict[str, Any]:
    # Respect explicit "unassigned" state for migrated rows.
    if item.get("_assignment_bound"):
        return item
    if item.get("assigned_user_id") or item.get("assigned_user_name"):
        return item
    by_profile_id, by_identity = legacy_maps or await _legacy_assignment_maps(owner_id)
    assigned = (None, None)
    profile_id = item.get("profile_id")
    if profile_id and profile_id in by_profile_id:
        assigned = by_profile_id[profile_id]
    if not assigned[0]:
        assigned = by_identity.get(_client_key(item.get("client_name"), item.get("phone_number")), (None, None))
    if assigned[0] or assigned[1]:
        updated = await update_client_request_db(
            owner_id,
            item["id"],
            {"assigned_user_id": assigned[0], "assigned_user_name": assigned[1]},
        )
        return updated or item
    return item


async def _ensure_offer_assignment(
    owner_id: str,
    item: Dict[str, Any],
    legacy_maps: Optional[LegacyAssignmentMaps] = None,
) -> Dict[str, Any]:
    # Respect explicit "unassigned" state for migrated rows.
    if item.get("_assignment_bound"):
        return item
    if item.get("assigned_user_id") or item.get("assigned_user_name"):
        return item
    by_profile_id, by_identity = legacy_maps or await _legacy_assignment_maps(owner_id)
    assigned = (None, None)
    profile_id = item.get("profile_id")
    if profile_id and profile_id in by_profile_id:
        assigned = by_profile_id[profile_id]
    if not assigned[0]:
        assigned = by_identity.get(_client_key(item.get("client_name"), item.get("phone_number")), (None, None))
    if assigned[0] or assigned[1]:
        updated = await update_client_offer_db(
            owner_id,
            item["id"],
            {"assigned_user_id": assigned[0], "assigned_user_name": assigned[1]},
        )
        return updated or item
    return item


def _to_int_or_none(v):
    if v in (None, ""):
        return None
    try:
        return int(float(v))
    except Exception:
        return None


async def create_client_request_service(payload: ClientRequestInput, current_user: UserPublic) -> ClientRequestPublic:
    require_permission(current_user, "can_manage_clients")
    owner_id = _owner_id(current_user)
    if not owner_id:
        raise HTTPException(status_code=400, detail="لا يمكن تحديد شركة الحساب الحالي.")

    text = (payload.raw_text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="نص الطلب مطلوب.")

    processed = process_client_request_text(text, api_key=None)
    if not processed or "error" in processed:
        details = str((processed or {}).get("details", ""))
        raise HTTPException(status_code=422, detail=f"تعذر تحليل الطلب: {details or 'خطأ غير متوقع'}")

    neighborhoods = processed.get("neighborhoods")
    if not isinstance(neighborhoods, list):
        neighborhoods = []
    neighborhoods = [str(n).strip() for n in neighborhoods if str(n).strip()]

    assigned_user_id = payload.assigned_user_id
    assigned_user_name = payload.assigned_user_name
    if current_user.role == "employee":
        assigned_user_id = current_user.id
        assigned_user_name = current_user.display_name or current_user.email
    elif not assigned_user_id and payload.profile_id:
        profile = await get_client_profile_by_id_db(owner_id, payload.profile_id)
        if profile:
            assigned_user_id = profile.get("assigned_user_id")
            assigned_user_name = profile.get("assigned_user_name")

    doc = {
        "profile_id": payload.profile_id,
        "raw_text": text,
        "client_name": payload.client_name or str(processed.get("client_name") or "غير محدد").strip() or "غير محدد",
        "phone_number": payload.phone_number or (str(processed.get("phone_number")).strip() if processed.get("phone_number") else None),
        "assigned_user_id": assigned_user_id,
        "assigned_user_name": assigned_user_name,
        "property_type": str(processed.get("property_type") or "غير محدد").strip() or "غير محدد",
        "city": normalize_city(str(processed.get("city") or "غير محدد").strip() or "غير محدد"),
        "neighborhoods": neighborhoods,
        "budget_min": _to_int_or_none(processed.get("budget_min")),
        "budget_max": _to_int_or_none(processed.get("budget_max")),
        "area_min": _to_int_or_none(processed.get("area_min")),
        "area_max": _to_int_or_none(processed.get("area_max")),
        "additional_requirements": str(processed.get("additional_requirements") or "").strip(),
        "action_plan": str(processed.get("suggested_action_plan") or "").strip(),
        "follow_up_details": payload.follow_up_details,
        "status": "new",
    }
    created = await create_client_request_db(owner_id, doc)
    await create_owner_team_notification(
        owner_id=owner_id,
        type="client_request_created",
        category="clients",
        title="طلب عميل جديد",
        message=f"تم إنشاء طلب جديد للعميل {doc.get('client_name')}.",
        link="/app?section=clients&tab=requests",
        metadata={"request_id": str(created.get("id") or "")},
    )
    return ClientRequestPublic(**created)


async def list_client_requests_service(current_user: UserPublic) -> List[ClientRequestPublic]:
    owner_id = _owner_id(current_user)
    if not owner_id:
        return []
    rows = await get_client_requests_db(owner_id, limit=500)
    legacy_maps = await _legacy_assignment_maps(owner_id)
    hydrated_rows: List[Dict[str, Any]] = []
    for row in rows:
        hydrated_rows.append(await _ensure_request_assignment(owner_id, row, legacy_maps))
    rows = [r for r in hydrated_rows if _is_visible_item(r, current_user)]
    return [ClientRequestPublic(**r) for r in rows]


async def get_client_request_matches_service(request_id: str, current_user: UserPublic) -> List[Property]:
    owner_id = _owner_id(current_user)
    if not owner_id:
        return []
    request_item = await get_client_request_by_id_db(owner_id, request_id)
    if not request_item:
        raise HTTPException(status_code=404, detail="الطلب غير موجود.")
    request_item = await _ensure_request_assignment(owner_id, request_item)
    if not _is_visible_item(request_item, current_user):
        raise HTTPException(status_code=403, detail="لا تملك صلاحية الوصول إلى هذا العميل.")

    city = normalize_city((request_item.get("city") or "").strip())
    property_type = (request_item.get("property_type") or "").strip()
    neighborhoods = [normalize_neighborhood(n) for n in (request_item.get("neighborhoods") or []) if n]
    budget_min = request_item.get("budget_min")
    budget_max = request_item.get("budget_max")
    area_min = request_item.get("area_min")
    area_max = request_item.get("area_max")

    def clean_text(value: Optional[str]) -> str:
        if not value:
            return ""
        text = str(value).strip().lower()
        text = text.replace("أ", "ا").replace("إ", "ا").replace("آ", "ا").replace("ة", "ه")
        return re.sub(r"\s+", " ", text)

    def property_type_matches(prop_type: str, wanted_type: str) -> bool:
        prop = clean_text(prop_type)
        wanted = clean_text(wanted_type)
        if not wanted or wanted == clean_text("غير محدد"):
            return False
        type_tokens = ("ارض", "فيلا", "شقه", "عماره", "دوبلكس", "استراحه", "مكتب", "محل", "تاون هاوس", "townhouse")
        wanted_tokens = [token for token in type_tokens if token in wanted]
        if wanted_tokens:
            return any(token in prop for token in wanted_tokens)
        return wanted in prop or prop in wanted

    def in_range(value, min_value, max_value, tolerance: float = 0.15) -> bool:
        if not isinstance(value, (int, float)):
            return False
        low = float(min_value) * (1 - tolerance) if isinstance(min_value, (int, float)) and min_value > 0 else None
        high = float(max_value) * (1 + tolerance) if isinstance(max_value, (int, float)) and max_value > 0 else None
        if low is not None and float(value) < low:
            return False
        if high is not None and float(value) > high:
            return False
        return low is not None or high is not None

    wanted_city = clean_text(city)
    wanted_neighborhoods = [clean_text(n) for n in neighborhoods if n]
    all_properties = await get_properties({"owner_id": owner_id}, limit=500)
    scored_matches: List[dict] = []
    for prop in all_properties:
        score = 0
        reasons = 0
        prop_city = clean_text(normalize_city(prop.get("city")))
        prop_neighborhood = clean_text(normalize_neighborhood(prop.get("neighborhood")))
        if wanted_city and wanted_city != clean_text("غير محدد"):
            if prop_city == wanted_city:
                score += 40
                reasons += 1
            else:
                score -= 35
        if property_type_matches(prop.get("property_type", ""), property_type):
            score += 35
            reasons += 1
        elif property_type and clean_text(property_type) != clean_text("غير محدد"):
            score -= 20
        if wanted_neighborhoods:
            if prop_neighborhood in wanted_neighborhoods:
                score += 30
                reasons += 1
            elif any(n in prop_neighborhood or prop_neighborhood in n for n in wanted_neighborhoods):
                score += 18
                reasons += 1
        if in_range(prop.get("price"), budget_min, budget_max):
            score += 20
            reasons += 1
        elif isinstance(budget_min, (int, float)) or isinstance(budget_max, (int, float)):
            score -= 8
        if in_range(prop.get("area"), area_min, area_max, tolerance=0.2):
            score += 10
            reasons += 1
        if reasons > 0 and score > 0:
            if score >= 95:
                prop["match_level"] = 1
            elif score >= 65:
                prop["match_level"] = 2
            elif score >= 35:
                prop["match_level"] = 3
            else:
                prop["match_level"] = 4
            prop["match_score"] = score
            scored_matches.append(prop)
    scored_matches.sort(
        key=lambda p: (p.get("match_score", 0), 1 if p.get("images") else 0, p.get("updated_at") or p.get("created_at") or ""),
        reverse=True,
    )
    return [Property(**p) for p in scored_matches[:50]]


async def create_client_request_note_service(
    request_id: str,
    payload: ClientNoteInput,
    current_user: UserPublic,
) -> ClientNotePublic:
    require_permission(current_user, "can_manage_clients")
    owner_id = _owner_id(current_user)
    if not owner_id:
        raise HTTPException(status_code=400, detail="لا يمكن تحديد شركة الحساب الحالي.")
    request_item = await get_client_request_by_id_db(owner_id, request_id)
    if not request_item:
        raise HTTPException(status_code=404, detail="طلب العميل غير موجود.")
    request_item = await _ensure_request_assignment(owner_id, request_item)
    if not _is_visible_item(request_item, current_user):
        raise HTTPException(status_code=403, detail="لا تملك صلاحية الوصول إلى هذا العميل.")
    note = await create_client_note_db(
        owner_id,
        request_id,
        {
            "content": payload.content,
            "author_name": current_user.display_name or current_user.email.split("@")[0],
            "author_role": current_user.role or "owner",
            "color": payload.color,
        },
    )
    assignee_id = request_item.get("assigned_user_id")
    await create_owner_team_notification(
        owner_id=owner_id,
        type="client_note_created",
        category="clients",
        title="إضافة ملاحظة جديدة",
        message=f"تمت إضافة ملاحظة على طلب العميل {request_item.get('client_name')}.",
        actor_user_id=current_user.id,
        recipient_roles={"owner", "manager"},
        exclude_user_ids={assignee_id} if assignee_id else None,
        link="/app?section=clients&tab=requests",
        metadata={"request_id": request_id, "note_id": str(note.get('id') or "")},
    )
    if assignee_id and assignee_id != current_user.id:
        assignee_user = await get_user_by_id(assignee_id)
        if assignee_user:
            await create_notification(
                user_id=assignee_id,
                owner_id=owner_id,
                type="client_note_created",
                category="clients",
                title="إضافة ملاحظة على عميلك",
                message=f"تمت إضافة ملاحظة جديدة على طلب العميل {request_item.get('client_name')}.",
                link="/app?section=clients&tab=requests",
                metadata={"request_id": request_id, "note_id": str(note.get('id') or "")},
            )
    return ClientNotePublic(**note)


async def list_client_request_notes_service(request_id: str, current_user: UserPublic) -> List[ClientNotePublic]:
    owner_id = _owner_id(current_user)
    if not owner_id:
        return []
    request_item = await get_client_request_by_id_db(owner_id, request_id)
    if not request_item:
        raise HTTPException(status_code=404, detail="طلب العميل غير موجود.")
    request_item = await _ensure_request_assignment(owner_id, request_item)
    if not _is_visible_item(request_item, current_user):
        raise HTTPException(status_code=403, detail="لا تملك صلاحية الوصول إلى هذا العميل.")
    notes = await get_client_notes_db(owner_id, request_id)
    return [ClientNotePublic(**n) for n in notes]


async def update_client_request_note_service(
    request_id: str,
    note_id: str,
    payload: ClientNoteUpdate,
    current_user: UserPublic,
) -> ClientNotePublic:
    require_permission(current_user, "can_manage_clients")
    owner_id = _owner_id(current_user)
    if not owner_id:
        raise HTTPException(status_code=400, detail="لا يمكن تحديد شركة الحساب الحالي.")
    request_item = await get_client_request_by_id_db(owner_id, request_id)
    if not request_item:
        raise HTTPException(status_code=404, detail="طلب العميل غير موجود.")
    request_item = await _ensure_request_assignment(owner_id, request_item)
    if not _is_visible_item(request_item, current_user):
        raise HTTPException(status_code=403, detail="لا تملك صلاحية الوصول إلى هذا العميل.")
    updates = payload.model_dump(exclude_unset=True)
    updated = await update_client_note_db(owner_id, note_id, updates)
    if not updated or updated.get("request_id") != request_id:
        raise HTTPException(status_code=404, detail="الملاحظة غير موجودة.")
    return ClientNotePublic(**updated)


async def delete_client_request_note_service(request_id: str, note_id: str, current_user: UserPublic) -> None:
    require_permission(current_user, "can_manage_clients")
    owner_id = _owner_id(current_user)
    if not owner_id:
        raise HTTPException(status_code=400, detail="لا يمكن تحديد شركة الحساب الحالي.")
    request_item = await get_client_request_by_id_db(owner_id, request_id)
    if not request_item:
        raise HTTPException(status_code=404, detail="طلب العميل غير موجود.")
    if not await _can_access_client_record(owner_id, current_user, request_item.get("client_name"), request_item.get("phone_number")):
        raise HTTPException(status_code=403, detail="لا تملك صلاحية الوصول إلى هذا العميل.")
    notes = await get_client_notes_db(owner_id, request_id)
    if not any(note.get("id") == note_id for note in notes):
        raise HTTPException(status_code=404, detail="الملاحظة غير موجودة.")
    deleted = await delete_client_note_db(owner_id, note_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="الملاحظة غير موجودة.")


async def update_client_request_service(
    request_id: str,
    payload: ClientRequestUpdate,
    current_user: UserPublic,
) -> ClientRequestPublic:
    require_permission(current_user, "can_manage_clients")
    owner_id = _owner_id(current_user)
    if not owner_id:
        raise HTTPException(status_code=400, detail="لا يمكن تحديد شركة الحساب الحالي.")
    current_item = await get_client_request_by_id_db(owner_id, request_id)
    if not current_item:
        raise HTTPException(status_code=404, detail="طلب العميل غير موجود.")
    current_item = await _ensure_request_assignment(owner_id, current_item)
    if not _is_visible_item(current_item, current_user):
        raise HTTPException(status_code=403, detail="لا تملك صلاحية الوصول إلى هذا العميل.")
    updates = payload.model_dump(exclude_unset=True)
    if ("assigned_user_id" in updates or "assigned_user_name" in updates) and not has_permission(current_user, "can_change_assignee"):
        raise HTTPException(status_code=403, detail="لا تملك صلاحية تغيير الموظف المسؤول.")
    if current_user.role == "employee" and ("assigned_user_id" in updates or "assigned_user_name" in updates):
        raise HTTPException(status_code=403, detail="تعديل الموظف المسؤول متاح للمالك أو المدير فقط.")
    if "city" in updates:
        updates["city"] = normalize_city(updates.get("city"))
    if "neighborhoods" in updates and isinstance(updates["neighborhoods"], list):
        updates["neighborhoods"] = [str(v).strip() for v in updates["neighborhoods"] if str(v).strip()]
    updated = await update_client_request_db(owner_id, request_id, updates)
    if not updated:
        raise HTTPException(status_code=404, detail="طلب العميل غير موجود.")
    return ClientRequestPublic(**updated)


async def delete_client_request_service(request_id: str, current_user: UserPublic) -> None:
    require_permission(current_user, "can_manage_clients")
    owner_id = _owner_id(current_user)
    if not owner_id:
        raise HTTPException(status_code=400, detail="لا يمكن تحديد شركة الحساب الحالي.")
    current_item = await get_client_request_by_id_db(owner_id, request_id)
    if not current_item:
        raise HTTPException(status_code=404, detail="طلب العميل غير موجود.")
    current_item = await _ensure_request_assignment(owner_id, current_item)
    if not _is_visible_item(current_item, current_user):
        raise HTTPException(status_code=403, detail="لا تملك صلاحية الوصول إلى هذا العميل.")
    ok = await delete_client_request_db(owner_id, request_id)
    if not ok:
        raise HTTPException(status_code=404, detail="طلب العميل غير موجود.")


async def get_client_requests_stats_service(current_user: UserPublic) -> Dict[str, object]:
    require_permission(current_user, "can_view_analytics")
    owner_id = _owner_id(current_user)
    if not owner_id:
        return {
            "total_requests": 0,
            "active_requests": 0,
            "new_requests": 0,
            "new_last_30_days": 0,
            "percentage_change": 0.0,
            "active_percentage_change": 0.0,
            "new_percentage_change": 0.0,
        }
    return await get_client_requests_stats_db(owner_id)


async def list_client_offers_service(current_user: UserPublic) -> List[ClientOfferPublic]:
    owner_id = _owner_id(current_user)
    if not owner_id:
        return []
    offers = await get_client_offers_db(owner_id)
    legacy_maps = await _legacy_assignment_maps(owner_id)
    hydrated_offers: List[Dict[str, Any]] = []
    for offer in offers:
        hydrated_offers.append(await _ensure_offer_assignment(owner_id, offer, legacy_maps))
    offers = [o for o in hydrated_offers if _is_visible_item(o, current_user)]
    return [ClientOfferPublic(**o) for o in offers]


async def create_client_offer_service(payload: ClientOfferInput, current_user: UserPublic) -> ClientOfferPublic:
    require_permission(current_user, "can_manage_clients")
    owner_id = _owner_id(current_user)
    if not owner_id:
        raise HTTPException(status_code=400, detail="لا يمكن تحديد شركة الحساب الحالي.")
    if payload.property_id:
        property_item = await get_property_by_id(payload.property_id)
        if not property_item or property_item.get("owner_id") != owner_id:
            raise HTTPException(status_code=404, detail="العقار غير موجود.")
    if not (payload.profile_id and str(payload.profile_id).strip()):
        await get_or_create_client_profile_with_type_db(owner_id, payload.client_name, payload.phone_number, "offer")
    assigned_user_id = payload.assigned_user_id
    assigned_user_name = payload.assigned_user_name
    if current_user.role == "employee":
        assigned_user_id = current_user.id
        assigned_user_name = current_user.display_name or current_user.email
    elif not assigned_user_id and payload.profile_id:
        profile = await get_client_profile_by_id_db(owner_id, payload.profile_id)
        if profile:
            assigned_user_id = profile.get("assigned_user_id")
            assigned_user_name = profile.get("assigned_user_name")

    offer = await create_client_offer_db(
        owner_id,
        {
            "profile_id": payload.profile_id,
            "client_name": payload.client_name,
            "phone_number": payload.phone_number,
            "property_id": payload.property_id,
            "follow_up_details": payload.follow_up_details,
            "assigned_user_id": assigned_user_id,
            "assigned_user_name": assigned_user_name,
        },
    )
    await create_owner_team_notification(
        owner_id=owner_id,
        type="client_offer_created",
        category="clients",
        title="عرض عميل جديد",
        message=f"تم إنشاء عرض جديد للعميل {payload.client_name}.",
        link="/app?section=clients&tab=offers",
        metadata={"offer_id": str(offer.get("id") or "")},
    )
    return ClientOfferPublic(**offer)


async def get_client_offers_by_client_service(
    client_name: str,
    phone_number: Optional[str],
    profile_id: Optional[str],
    current_user: UserPublic,
) -> List[ClientOfferPublic]:
    owner_id = _owner_id(current_user)
    if not owner_id:
        return []
    offers = await get_client_offers_by_client_db(owner_id, client_name, phone_number, profile_id)
    legacy_maps = await _legacy_assignment_maps(owner_id)
    offers = [await _ensure_offer_assignment(owner_id, offer, legacy_maps) for offer in offers]
    offers = [offer for offer in offers if _is_visible_item(offer, current_user)]
    if not offers and current_user.role != "owner" and not has_permission(current_user, "can_view_all_clients"):
        raise HTTPException(status_code=403, detail="لا تملك صلاحية الوصول إلى هذا العميل.")
    return [ClientOfferPublic(**o) for o in offers]


async def get_client_offer_service(offer_id: str, current_user: UserPublic) -> ClientOfferPublic:
    owner_id = _owner_id(current_user)
    if not owner_id:
        raise HTTPException(status_code=400, detail="لا يمكن تحديد شركة الحساب الحالي.")
    offer = await get_client_offer_by_id_db(owner_id, offer_id)
    if not offer:
        raise HTTPException(status_code=404, detail="العرض غير موجود.")
    offer = await _ensure_offer_assignment(owner_id, offer)
    if not _is_visible_item(offer, current_user):
        raise HTTPException(status_code=403, detail="لا تملك صلاحية الوصول إلى هذا العميل.")
    return ClientOfferPublic(**offer)


async def update_client_offer_service(
    offer_id: str,
    payload: ClientOfferUpdate,
    current_user: UserPublic,
) -> ClientOfferPublic:
    require_permission(current_user, "can_manage_clients")
    owner_id = _owner_id(current_user)
    if not owner_id:
        raise HTTPException(status_code=400, detail="لا يمكن تحديد شركة الحساب الحالي.")
    current_item = await get_client_offer_by_id_db(owner_id, offer_id)
    if not current_item:
        raise HTTPException(status_code=404, detail="العرض غير موجود.")
    current_item = await _ensure_offer_assignment(owner_id, current_item)
    if not _is_visible_item(current_item, current_user):
        raise HTTPException(status_code=403, detail="لا تملك صلاحية الوصول إلى هذا العميل.")
    updates = payload.model_dump(exclude_unset=True)
    if ("assigned_user_id" in updates or "assigned_user_name" in updates) and not has_permission(current_user, "can_change_assignee"):
        raise HTTPException(status_code=403, detail="لا تملك صلاحية تغيير الموظف المسؤول.")
    if current_user.role == "employee" and ("assigned_user_id" in updates or "assigned_user_name" in updates):
        raise HTTPException(status_code=403, detail="تعديل الموظف المسؤول متاح للمالك أو المدير فقط.")
    updated = await update_client_offer_db(owner_id, offer_id, updates)
    if not updated:
        raise HTTPException(status_code=404, detail="العرض غير موجود.")
    return ClientOfferPublic(**updated)


async def delete_client_offer_service(offer_id: str, current_user: UserPublic) -> None:
    require_permission(current_user, "can_manage_clients")
    owner_id = _owner_id(current_user)
    if not owner_id:
        raise HTTPException(status_code=400, detail="لا يمكن تحديد شركة الحساب الحالي.")
    current_item = await get_client_offer_by_id_db(owner_id, offer_id)
    if not current_item:
        raise HTTPException(status_code=404, detail="العرض غير موجود.")
    current_item = await _ensure_offer_assignment(owner_id, current_item)
    if not _is_visible_item(current_item, current_user):
        raise HTTPException(status_code=403, detail="لا تملك صلاحية الوصول إلى هذا العميل.")
    deleted = await delete_client_offer_db(owner_id, offer_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="العرض غير موجود.")


async def create_client_offer_note_service(
    offer_id: str,
    payload: ClientNoteInput,
    current_user: UserPublic,
) -> ClientNotePublic:
    require_permission(current_user, "can_manage_clients")
    owner_id = _owner_id(current_user)
    if not owner_id:
        raise HTTPException(status_code=400, detail="لا يمكن تحديد شركة الحساب الحالي.")
    offer_item = await get_client_offer_by_id_db(owner_id, offer_id)
    if not offer_item:
        raise HTTPException(status_code=404, detail="العرض غير موجود.")
    offer_item = await _ensure_offer_assignment(owner_id, offer_item)
    if not _is_visible_item(offer_item, current_user):
        raise HTTPException(status_code=403, detail="لا تملك صلاحية الوصول إلى هذا العميل.")
    note = await create_client_offer_note_db(
        owner_id,
        offer_id,
        {
            "content": payload.content,
            "author_name": current_user.display_name or current_user.email.split("@")[0],
            "author_role": current_user.role or "owner",
            "color": payload.color,
        },
    )
    assignee_id = offer_item.get("assigned_user_id")
    await create_owner_team_notification(
        owner_id=owner_id,
        type="client_note_created",
        category="clients",
        title="إضافة ملاحظة جديدة",
        message=f"تمت إضافة ملاحظة على عرض العميل {offer_item.get('client_name')}.",
        actor_user_id=current_user.id,
        recipient_roles={"owner", "manager"},
        exclude_user_ids={assignee_id} if assignee_id else None,
        link="/app?section=clients&tab=offers",
        metadata={"offer_id": offer_id, "note_id": str(note.get('id') or "")},
    )
    if assignee_id and assignee_id != current_user.id:
        assignee_user = await get_user_by_id(assignee_id)
        if assignee_user:
            await create_notification(
                user_id=assignee_id,
                owner_id=owner_id,
                type="client_note_created",
                category="clients",
                title="إضافة ملاحظة على عميلك",
                message=f"تمت إضافة ملاحظة جديدة على عرض العميل {offer_item.get('client_name')}.",
                link="/app?section=clients&tab=offers",
                metadata={"offer_id": offer_id, "note_id": str(note.get('id') or "")},
            )
    return ClientNotePublic(**note)


async def list_client_offer_notes_service(offer_id: str, current_user: UserPublic) -> List[ClientNotePublic]:
    owner_id = _owner_id(current_user)
    if not owner_id:
        raise HTTPException(status_code=400, detail="لا يمكن تحديد شركة الحساب الحالي.")
    offer_item = await get_client_offer_by_id_db(owner_id, offer_id)
    if not offer_item:
        raise HTTPException(status_code=404, detail="العرض غير موجود.")
    offer_item = await _ensure_offer_assignment(owner_id, offer_item)
    if not _is_visible_item(offer_item, current_user):
        raise HTTPException(status_code=403, detail="لا تملك صلاحية الوصول إلى هذا العميل.")
    notes = await get_client_offer_notes_db(offer_id)
    return [ClientNotePublic(**n) for n in notes]


async def update_client_offer_note_service(
    offer_id: str,
    note_id: str,
    payload: ClientNoteUpdate,
    current_user: UserPublic,
) -> ClientNotePublic:
    require_permission(current_user, "can_manage_clients")
    owner_id = _owner_id(current_user)
    if not owner_id:
        raise HTTPException(status_code=400, detail="لا يمكن تحديد شركة الحساب الحالي.")
    offer_item = await get_client_offer_by_id_db(owner_id, offer_id)
    if not offer_item:
        raise HTTPException(status_code=404, detail="العرض غير موجود.")
    offer_item = await _ensure_offer_assignment(owner_id, offer_item)
    if not _is_visible_item(offer_item, current_user):
        raise HTTPException(status_code=403, detail="لا تملك صلاحية الوصول إلى هذا العميل.")
    updates = payload.model_dump(exclude_unset=True)
    updated = await update_client_offer_note_db(owner_id, note_id, updates)
    if not updated:
        raise HTTPException(status_code=404, detail="الملاحظة غير موجودة.")
    return ClientNotePublic(**updated)


async def delete_client_offer_note_service(offer_id: str, note_id: str, current_user: UserPublic) -> None:
    require_permission(current_user, "can_manage_clients")
    owner_id = _owner_id(current_user)
    if not owner_id:
        raise HTTPException(status_code=400, detail="لا يمكن تحديد شركة الحساب الحالي.")
    offer_item = await get_client_offer_by_id_db(owner_id, offer_id)
    if not offer_item:
        raise HTTPException(status_code=404, detail="العرض غير موجود.")
    offer_item = await _ensure_offer_assignment(owner_id, offer_item)
    if not _is_visible_item(offer_item, current_user):
        raise HTTPException(status_code=403, detail="لا تملك صلاحية الوصول إلى هذا العميل.")
    deleted = await delete_client_offer_note_db(owner_id, note_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="الملاحظة غير موجودة.")


async def get_client_offers_stats_service(current_user: UserPublic) -> Dict[str, object]:
    require_permission(current_user, "can_view_analytics")
    owner_id = _owner_id(current_user)
    if not owner_id:
        return {
            "total_offers": 0,
            "active_offers": 0,
            "new_last_30_days": 0,
            "percentage_change": 0.0,
            "active_percentage_change": 0.0,
        }
    return await get_client_offers_stats_db(owner_id)


async def create_client_profile_service(payload: ClientProfileInput, current_user: UserPublic) -> ClientProfilePublic:
    require_permission(current_user, "can_manage_clients")
    owner_id = _owner_id(current_user)
    if not owner_id:
        raise HTTPException(status_code=400, detail="لا يمكن تحديد شركة الحساب الحالي.")
    profile_data = payload.model_dump()
    # Assignment is now controlled per request/offer, not on profile itself.
    profile_data.pop("assigned_user_id", None)
    profile_data.pop("assigned_user_name", None)
    profile = await create_client_profile_db(owner_id, profile_data)
    return ClientProfilePublic(**profile)


async def list_client_profiles_service(
    client_type: Optional[str],
    client_name: Optional[str],
    phone_number: Optional[str],
    current_user: UserPublic,
) -> List[ClientProfilePublic]:
    owner_id = _owner_id(current_user)
    if not owner_id:
        return []
    profiles = await (get_client_profiles_by_type_db(owner_id, client_type) if client_type else get_client_profiles_db(owner_id))
    if current_user.role != "owner" and not has_permission(current_user, "can_view_all_clients"):
        if not has_permission(current_user, "can_view_own_clients_only"):
            return []
        keys = await _assigned_client_keys(owner_id, current_user.id or "")
        profiles = [p for p in profiles if _client_key(p.get("client_name"), p.get("phone_number")) in keys]
    if client_name:
        target_name = client_name.strip().lower()
        profiles = [p for p in profiles if (p.get("client_name") or "").strip().lower() == target_name]
    if phone_number:
        target_phone = phone_number.strip()
        profiles = [p for p in profiles if (p.get("phone_number") or "").strip() == target_phone]
    return [ClientProfilePublic(**p) for p in profiles]


async def get_client_profile_service(profile_id: str, current_user: UserPublic) -> ClientProfilePublic:
    owner_id = _owner_id(current_user)
    if not owner_id:
        raise HTTPException(status_code=400, detail="لا يمكن تحديد شركة الحساب الحالي.")
    profile = await get_client_profile_by_id_db(owner_id, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="الملف الشخصي غير موجود.")
    if current_user.role != "owner" and not has_permission(current_user, "can_view_all_clients"):
        if not has_permission(current_user, "can_view_own_clients_only"):
            raise HTTPException(status_code=403, detail="لا تملك صلاحية الوصول إلى هذا العميل.")
        keys = await _assigned_client_keys(owner_id, current_user.id or "")
        if _client_key(profile.get("client_name"), profile.get("phone_number")) not in keys:
            raise HTTPException(status_code=403, detail="لا تملك صلاحية الوصول إلى هذا العميل.")
    return ClientProfilePublic(**profile)


async def update_client_profile_service(
    profile_id: str,
    payload: ClientProfileUpdate,
    current_user: UserPublic,
) -> ClientProfilePublic:
    require_permission(current_user, "can_manage_clients")
    owner_id = _owner_id(current_user)
    if not owner_id:
        raise HTTPException(status_code=400, detail="لا يمكن تحديد شركة الحساب الحالي.")
    current_profile = await get_client_profile_by_id_db(owner_id, profile_id)
    if not current_profile:
        raise HTTPException(status_code=404, detail="الملف الشخصي غير موجود.")
    if current_user.role != "owner" and not has_permission(current_user, "can_view_all_clients"):
        if not has_permission(current_user, "can_view_own_clients_only"):
            raise HTTPException(status_code=403, detail="لا تملك صلاحية الوصول إلى هذا العميل.")
        keys = await _assigned_client_keys(owner_id, current_user.id or "")
        if _client_key(current_profile.get("client_name"), current_profile.get("phone_number")) not in keys:
            raise HTTPException(status_code=403, detail="لا تملك صلاحية الوصول إلى هذا العميل.")
    updates = payload.model_dump(exclude_unset=True)
    updates.pop("assigned_user_id", None)
    updates.pop("assigned_user_name", None)
    updated = await update_client_profile_db(owner_id, profile_id, updates)
    if not updated:
        raise HTTPException(status_code=404, detail="الملف الشخصي غير موجود.")
    return ClientProfilePublic(**updated)


async def delete_client_profile_service(profile_id: str, current_user: UserPublic) -> None:
    require_permission(current_user, "can_manage_clients")
    owner_id = _owner_id(current_user)
    if not owner_id:
        raise HTTPException(status_code=400, detail="لا يمكن تحديد شركة الحساب الحالي.")
    current_profile = await get_client_profile_by_id_db(owner_id, profile_id)
    if not current_profile:
        raise HTTPException(status_code=404, detail="الملف الشخصي غير موجود.")
    if current_user.role != "owner" and not has_permission(current_user, "can_view_all_clients"):
        if not has_permission(current_user, "can_view_own_clients_only"):
            raise HTTPException(status_code=403, detail="لا تملك صلاحية الوصول إلى هذا العميل.")
        keys = await _assigned_client_keys(owner_id, current_user.id or "")
        if _client_key(current_profile.get("client_name"), current_profile.get("phone_number")) not in keys:
            raise HTTPException(status_code=403, detail="لا تملك صلاحية الوصول إلى هذا العميل.")
    deleted = await delete_client_profile_db(owner_id, profile_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="الملف الشخصي غير موجود.")


async def get_client_profiles_stats_service(current_user: UserPublic) -> Dict[str, object]:
    require_permission(current_user, "can_view_analytics")
    owner_id = _owner_id(current_user)
    if not owner_id:
        return {"total_clients": 0, "new_last_30_days": 0, "percentage_change": 0.0}
    return await get_client_profiles_stats_db(owner_id)
