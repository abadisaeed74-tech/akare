from datetime import datetime, timedelta
from typing import Dict, List, Optional

from database import (
    get_client_offers_db,
    get_client_profiles_db,
    get_client_requests_db,
    get_property_by_id,
)
from models import UserPublic
from utils.permissions import require_permission


def _owner_id(current_user: UserPublic) -> Optional[str]:
    return current_user.id if current_user.role == "owner" else current_user.company_owner_id


def _client_key(name: Optional[str], phone: Optional[str]) -> str:
    return f"{(name or 'غير محدد').strip()}|{(phone or '').strip()}"


def _to_dt(value):
    if isinstance(value, datetime):
        return value
    if isinstance(value, str) and value.strip():
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
        except Exception:
            return None
    return None


def _format_number(value: object) -> Optional[str]:
    if value in (None, "", "غير مذكور"):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return str(value).strip() or None
    if number.is_integer():
        return f"{int(number):,}"
    return f"{number:,.2f}".rstrip("0").rstrip(".")


def _build_offer_title(prop: Optional[Dict[str, object]]) -> str:
    if not prop:
        return "عرض غير مرتبط بعقار"

    parts = [
        str(prop.get("property_type") or "عقار").strip(),
        str(prop.get("neighborhood") or "").strip(),
        str(prop.get("city") or "").strip(),
    ]
    title = " - ".join(part for part in parts if part and part != "غير مذكور")

    details: List[str] = []
    area = _format_number(prop.get("area"))
    price = _format_number(prop.get("price"))
    if area:
        details.append(f"{area}م²")
    if price:
        details.append(f"{price} ر.س")

    if details:
        return f"{title or 'عقار'} ({'، '.join(details)})"
    return title or "عقار"


async def list_appointments_placeholder_service(current_user: UserPublic) -> List[dict]:
    require_permission(current_user, "can_manage_appointments")
    return []


async def list_appointments_service(
    date_filter: Optional[str],
    employee_id: Optional[str],
    current_user: UserPublic,
) -> List[Dict[str, object]]:
    require_permission(current_user, "can_manage_appointments")
    owner_id = _owner_id(current_user)
    if not owner_id:
        return []

    profiles = await get_client_profiles_db(owner_id)
    assigned_map: Dict[str, Dict[str, Optional[str]]] = {}
    for profile in profiles:
        assigned_map[_client_key(profile.get("client_name"), profile.get("phone_number"))] = {
            "id": profile.get("assigned_user_id"),
            "name": profile.get("assigned_user_name"),
        }

    requests = await get_client_requests_db(owner_id, limit=500)
    offers = await get_client_offers_db(owner_id, limit=500)
    property_title_cache: Dict[str, str] = {}

    now = datetime.utcnow()
    rows: List[Dict[str, object]] = []

    for req in requests:
        deadline = _to_dt(req.get("deadline_at"))
        if not deadline:
            continue
        ck = _client_key(req.get("client_name"), req.get("phone_number"))
        assigned_user_id = req.get("assigned_user_id")
        assigned_user_name = req.get("assigned_user_name")
        if not assigned_user_id and not assigned_user_name:
            assigned_user = assigned_map.get(ck, {})
            assigned_user_id = assigned_user.get("id")
            assigned_user_name = assigned_user.get("name")

        if current_user.role == "employee" and assigned_user_id and assigned_user_id != current_user.id:
            continue
        if current_user.role == "employee" and assigned_user_id is None:
            continue
        if current_user.role in ("owner", "manager") and employee_id and assigned_user_id != employee_id:
            continue

        if date_filter == "today" and deadline.date() != now.date():
            continue
        if date_filter == "this_week":
            week_start = now - timedelta(days=now.weekday())
            week_end = week_start + timedelta(days=7)
            if not (week_start.date() <= deadline.date() < week_end.date()):
                continue
        if date_filter == "delayed" and deadline >= now:
            continue

        rows.append(
            {
                "id": req.get("id"),
                "type": "request",
                "client_name": req.get("client_name"),
                "phone_number": req.get("phone_number"),
                "property_type": req.get("property_type"),
                "city": req.get("city"),
                "neighborhood": (req.get("neighborhoods") or [None])[0],
                "property_id": None,
                "reminder_type": req.get("reminder_type"),
                "deadline_at": req.get("deadline_at"),
                "reminder_before_minutes": req.get("reminder_before_minutes"),
                "follow_up_details": req.get("follow_up_details"),
                "status": req.get("status", "new"),
                "created_at": req.get("created_at"),
                "source_id": req.get("id"),
                "source_type": "request",
                "client_key": ck,
                "title": f"{req.get('property_type', 'طلب')} - {req.get('city', 'غير محدد')}",
                "assigned_user_id": assigned_user_id if current_user.role in ("owner", "manager") else None,
                "assigned_user_name": assigned_user_name if current_user.role in ("owner", "manager") else None,
            }
        )

    for offer in offers:
        deadline = _to_dt(offer.get("deadline_at"))
        if not deadline:
            continue
        property_id = str(offer.get("property_id") or "").strip()
        offer_title = property_title_cache.get(property_id)
        if offer_title is None:
            prop = await get_property_by_id(property_id) if property_id else None
            if prop and prop.get("owner_id") != owner_id:
                prop = None
            offer_title = _build_offer_title(prop)
            if property_id:
                property_title_cache[property_id] = offer_title
        ck = _client_key(offer.get("client_name"), offer.get("phone_number"))
        assigned_user_id = offer.get("assigned_user_id")
        assigned_user_name = offer.get("assigned_user_name")
        if not assigned_user_id and not assigned_user_name:
            assigned_user = assigned_map.get(ck, {})
            assigned_user_id = assigned_user.get("id")
            assigned_user_name = assigned_user.get("name")

        if current_user.role == "employee" and assigned_user_id and assigned_user_id != current_user.id:
            continue
        if current_user.role == "employee" and assigned_user_id is None:
            continue
        if current_user.role in ("owner", "manager") and employee_id and assigned_user_id != employee_id:
            continue

        if date_filter == "today" and deadline.date() != now.date():
            continue
        if date_filter == "this_week":
            week_start = now - timedelta(days=now.weekday())
            week_end = week_start + timedelta(days=7)
            if not (week_start.date() <= deadline.date() < week_end.date()):
                continue
        if date_filter == "delayed" and deadline >= now:
            continue

        rows.append(
            {
                "id": offer.get("id"),
                "type": "offer",
                "client_name": offer.get("client_name"),
                "phone_number": offer.get("phone_number"),
                "property_type": None,
                "city": None,
                "neighborhood": None,
                "property_id": offer.get("property_id"),
                "reminder_type": offer.get("reminder_type"),
                "deadline_at": offer.get("deadline_at"),
                "reminder_before_minutes": offer.get("reminder_before_minutes"),
                "follow_up_details": offer.get("follow_up_details"),
                "status": offer.get("status", "new"),
                "created_at": offer.get("created_at"),
                "source_id": offer.get("id"),
                "source_type": "offer",
                "client_key": ck,
                "title": offer_title,
                "assigned_user_id": assigned_user_id if current_user.role in ("owner", "manager") else None,
                "assigned_user_name": assigned_user_name if current_user.role in ("owner", "manager") else None,
            }
        )

    rows.sort(key=lambda x: _to_dt(x.get("deadline_at")) or now)
    return rows
