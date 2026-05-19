import asyncio
import json
from collections import defaultdict
from datetime import datetime
from typing import Any, AsyncGenerator, Dict, List, Optional, Set

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import HTTPException
from pymongo import ReturnDocument

from database import get_team_for_owner, get_user_by_id, notification_collection
from models import NotificationPublic, UserPublic

_subscribers: dict[str, list[asyncio.Queue[dict]]] = defaultdict(list)
_indexes_initialized = False
_index_lock = asyncio.Lock()


def _notification_helper(doc: Dict[str, Any]) -> Dict[str, Any]:
    _id = doc.get("_id")
    metadata = doc.get("metadata") or {}
    return {
        "id": str(_id) if _id else "",
        "user_id": doc.get("user_id", ""),
        "owner_id": doc.get("owner_id"),
        "type": doc.get("type", "system"),
        "category": doc.get("category", "system"),
        "title": doc.get("title", ""),
        "message": doc.get("message", ""),
        "read": bool(doc.get("read", False)),
        "priority": doc.get("priority", "normal"),
        "link": doc.get("link"),
        "metadata": {str(k): str(v) for k, v in metadata.items()},
        "created_at": doc.get("created_at") or datetime.utcnow(),
        "read_at": doc.get("read_at"),
    }


async def _ensure_indexes() -> None:
    global _indexes_initialized
    if _indexes_initialized:
        return
    async with _index_lock:
        if _indexes_initialized:
            return
        await notification_collection.create_index([("user_id", 1), ("created_at", -1)])
        await notification_collection.create_index([("owner_id", 1), ("created_at", -1)])
        await notification_collection.create_index([("user_id", 1), ("read", 1), ("created_at", -1)])
        _indexes_initialized = True


async def send_realtime_notification(user_id: str, payload: Dict[str, Any]) -> None:
    queues = list(_subscribers.get(user_id, []))
    if not queues:
        return
    for queue in queues:
        try:
            queue.put_nowait(payload)
        except asyncio.QueueFull:
            pass


async def create_notification(
    *,
    user_id: str,
    owner_id: Optional[str],
    type: str,
    category: str,
    title: str,
    message: str,
    priority: str = "normal",
    link: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> NotificationPublic:
    await _ensure_indexes()
    doc = {
        "user_id": user_id,
        "owner_id": owner_id,
        "type": type,
        "category": category,
        "title": title,
        "message": message,
        "read": False,
        "priority": priority if priority in {"low", "normal", "high"} else "normal",
        "link": link,
        "metadata": metadata or {},
        "created_at": datetime.utcnow(),
        "read_at": None,
    }
    result = await notification_collection.insert_one(doc)
    created = await notification_collection.find_one({"_id": result.inserted_id})
    item = NotificationPublic(**_notification_helper(created or doc))
    await send_realtime_notification(
        user_id,
        {
            "event": "notification_created",
            "notification": item.model_dump(mode="json"),
        },
    )
    return item


async def create_owner_team_notification(
    *,
    owner_id: str,
    type: str,
    category: str,
    title: str,
    message: str,
    actor_user_id: Optional[str] = None,
    recipient_roles: Optional[Set[str]] = None,
    exclude_user_ids: Optional[Set[str]] = None,
    priority: str = "normal",
    link: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    team = await get_team_for_owner(owner_id)
    owner_user = await get_user_by_id(owner_id)
    if owner_user:
        team = [owner_user, *team]

    seen_user_ids: Set[str] = set()
    for user in team:
        user_id = user.get("id")
        if not user_id:
            continue
        if user_id in seen_user_ids:
            continue
        seen_user_ids.add(user_id)
        if actor_user_id and user_id == actor_user_id:
            continue
        if exclude_user_ids and user_id in exclude_user_ids:
            continue
        role = str(user.get("role") or "").strip()
        if recipient_roles and role not in recipient_roles:
            continue
        await create_notification(
            user_id=user_id,
            owner_id=owner_id,
            type=type,
            category=category,
            title=title,
            message=message,
            priority=priority,
            link=link,
            metadata=metadata,
        )


async def get_user_notifications(
    current_user: UserPublic,
    *,
    unread_only: bool = False,
    category: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
) -> Dict[str, Any]:
    await _ensure_indexes()
    query: Dict[str, Any] = {"user_id": current_user.id}
    if unread_only:
        query["read"] = False
    if category:
        query["category"] = category
    if search:
        query["$or"] = [
            {"title": {"$regex": search, "$options": "i"}},
            {"message": {"$regex": search, "$options": "i"}},
        ]
    page = max(1, int(page))
    page_size = min(100, max(1, int(page_size)))
    skip = (page - 1) * page_size
    total = await notification_collection.count_documents(query)
    rows: List[Dict[str, Any]] = []
    async for row in notification_collection.find(query).sort("created_at", -1).skip(skip).limit(page_size):
        rows.append(_notification_helper(row))
    return {"items": rows, "total": total, "page": page, "page_size": page_size}


async def get_unread_count(current_user: UserPublic) -> int:
    await _ensure_indexes()
    query: Dict[str, Any] = {"user_id": current_user.id, "read": False}
    return await notification_collection.count_documents(query)


async def mark_as_read(current_user: UserPublic, notification_id: str) -> Optional[NotificationPublic]:
    try:
        oid = ObjectId(notification_id)
    except InvalidId:
        return None
    query: Dict[str, Any] = {"_id": oid, "user_id": current_user.id}
    updated = await notification_collection.find_one_and_update(
        query,
        {"$set": {"read": True, "read_at": datetime.utcnow()}},
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        return None
    item = NotificationPublic(**_notification_helper(updated))
    await send_realtime_notification(
        item.user_id,
        {"event": "notification_read", "notification_id": item.id},
    )
    return item


async def mark_all_as_read(current_user: UserPublic) -> int:
    query: Dict[str, Any] = {"user_id": current_user.id, "read": False}
    result = await notification_collection.update_many(
        query,
        {"$set": {"read": True, "read_at": datetime.utcnow()}},
    )
    await send_realtime_notification(
        current_user.id or "",
        {"event": "notifications_read_all"},
    )
    return int(result.modified_count or 0)


async def delete_notification(current_user: UserPublic, notification_id: str) -> bool:
    try:
        oid = ObjectId(notification_id)
    except InvalidId:
        return False
    query: Dict[str, Any] = {"_id": oid, "user_id": current_user.id}
    result = await notification_collection.delete_one(query)
    if result.deleted_count:
        await send_realtime_notification(current_user.id or "", {"event": "notification_deleted", "notification_id": notification_id})
    return bool(result.deleted_count)


async def notification_stream(user_id: str) -> AsyncGenerator[str, None]:
    queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=100)
    _subscribers[user_id].append(queue)
    try:
        yield "event: connected\ndata: {\"ok\":true}\n\n"
        while True:
            try:
                payload = await asyncio.wait_for(queue.get(), timeout=25.0)
                yield f"event: {payload.get('event','message')}\ndata: {json.dumps(payload, ensure_ascii=False, default=str)}\n\n"
            except asyncio.TimeoutError:
                yield "event: ping\ndata: {}\n\n"
    finally:
        if queue in _subscribers.get(user_id, []):
            _subscribers[user_id].remove(queue)
        if not _subscribers.get(user_id):
            _subscribers.pop(user_id, None)
