from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, Optional
from zoneinfo import ZoneInfo

from fastapi import Request

from config import PLATFORM_ADMIN_EMAILS
from database import audit_log_collection
from models import UserPublic

logger = logging.getLogger(__name__)
UTC_TZ = ZoneInfo("UTC")
RIYADH_TZ = ZoneInfo("Asia/Riyadh")


def _extract_ip_address(request: Optional[Request]) -> Optional[str]:
    if not request:
        return None
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        first_ip = forwarded_for.split(",")[0].strip()
        if first_ip:
            return first_ip
    if request.client and request.client.host:
        return request.client.host
    return None


def _extract_user_agent(request: Optional[Request]) -> Optional[str]:
    if not request:
        return None
    return request.headers.get("user-agent")


def _to_utc_for_query(value: Optional[datetime]) -> Optional[datetime]:
    if not value:
        return None
    # Treat naive inputs as Saudi local time, then convert to UTC for DB query.
    if value.tzinfo is None:
        value = value.replace(tzinfo=RIYADH_TZ)
    return value.astimezone(UTC_TZ).replace(tzinfo=None)


def _to_riyadh_for_output(value: Any) -> Any:
    if not isinstance(value, datetime):
        return value
    # Mongo returns naive UTC datetime by default.
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC_TZ)
    return value.astimezone(RIYADH_TZ)


async def ensure_audit_indexes() -> None:
    await audit_log_collection.create_index("created_at")
    await audit_log_collection.create_index("action")
    await audit_log_collection.create_index("company_owner_id")
    await audit_log_collection.create_index("user_id")
    await audit_log_collection.create_index([("company_owner_id", 1), ("created_at", -1)])


async def create_audit_log(
    *,
    action: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    current_user: Optional[UserPublic] = None,
    company_owner_id: Optional[str] = None,
    request: Optional[Request] = None,
    user_id: Optional[str] = None,
    user_email: Optional[str] = None,
    user_name: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
) -> None:
    resolved_user_id = user_id or (current_user.id if current_user else None)
    resolved_user_email = user_email or (current_user.email if current_user else None)
    resolved_user_name = user_name or (current_user.display_name if current_user else None)
    resolved_owner_id = company_owner_id
    if not resolved_owner_id and current_user:
        resolved_owner_id = (
            current_user.id if current_user.role == "owner" else current_user.company_owner_id
        )

    doc: Dict[str, Any] = {
        "user_id": resolved_user_id,
        "user_email": resolved_user_email,
        "user_name": resolved_user_name,
        "company_owner_id": resolved_owner_id,
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "ip_address": _extract_ip_address(request),
        "user_agent": _extract_user_agent(request),
        "details": details or {},
        "created_at": datetime.utcnow(),
    }
    await audit_log_collection.insert_one(doc)

    logger.info(
        "%s | user=%s | user_id=%s | company_owner_id=%s | entity_type=%s | entity_id=%s",
        action,
        resolved_user_email or "<unknown>",
        resolved_user_id or "<unknown>",
        resolved_owner_id or "<unknown>",
        entity_type or "<none>",
        entity_id or "<none>",
    )


async def list_audit_logs_service(
    *,
    current_user: UserPublic,
    company_owner_id: Optional[str] = None,
    user_id: Optional[str] = None,
    action: Optional[str] = None,
    search: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    page: int = 1,
    page_size: int = 50,
) -> Dict[str, Any]:
    user_email = (current_user.email or "").strip().lower()
    if user_email not in PLATFORM_ADMIN_EMAILS:
        raise PermissionError("Platform admin access required")

    query: Dict[str, Any] = {}
    if company_owner_id:
        query["company_owner_id"] = company_owner_id
    if user_id:
        query["user_id"] = user_id
    if action:
        query["action"] = action
    if date_from or date_to:
        date_query: Dict[str, Any] = {}
        if date_from:
            date_query["$gte"] = _to_utc_for_query(date_from)
        if date_to:
            date_query["$lte"] = _to_utc_for_query(date_to)
        query["created_at"] = date_query
    if search:
        regex = {"$regex": search, "$options": "i"}
        query["$or"] = [
            {"user_email": regex},
            {"user_name": regex},
            {"action": regex},
            {"entity_type": regex},
            {"entity_id": regex},
            {"company_owner_id": regex},
        ]

    safe_page = max(1, int(page or 1))
    safe_page_size = max(1, min(200, int(page_size or 50)))
    skip = (safe_page - 1) * safe_page_size

    total = await audit_log_collection.count_documents(query)
    items = await audit_log_collection.find(query).sort("created_at", -1).skip(skip).limit(safe_page_size).to_list(length=safe_page_size)

    normalized_items = []
    for item in items:
        normalized_items.append(
            {
                "id": str(item.get("_id")),
                "user_id": item.get("user_id"),
                "user_email": item.get("user_email"),
                "user_name": item.get("user_name"),
                "company_owner_id": item.get("company_owner_id"),
                "action": item.get("action"),
                "entity_type": item.get("entity_type"),
                "entity_id": item.get("entity_id"),
                "ip_address": item.get("ip_address"),
                "user_agent": item.get("user_agent"),
                "details": item.get("details") or {},
                "created_at": _to_riyadh_for_output(item.get("created_at")),
            }
        )

    return {
        "items": normalized_items,
        "total": int(total),
        "page": safe_page,
        "page_size": safe_page_size,
    }
