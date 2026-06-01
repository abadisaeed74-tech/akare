from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from dependencies import get_current_user
from models import UserPublic
from services.notification_service import (
    delete_notification,
    get_unread_count,
    get_user_notifications,
    mark_all_as_read,
    mark_as_read,
    notification_stream,
)

router = APIRouter()


@router.get("/notifications")
async def list_notifications(
    unread_only: bool = Query(False),
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: UserPublic = Depends(get_current_user),
):
    return await get_user_notifications(
        current_user,
        unread_only=unread_only,
        category=category,
        search=search,
        page=page,
        page_size=page_size,
    )


@router.get("/notifications/unread-count")
async def unread_count(current_user: UserPublic = Depends(get_current_user)):
    count = await get_unread_count(current_user)
    return {"count": count}


@router.put("/notifications/{notification_id}/read")
async def mark_notification_as_read(
    notification_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    updated = await mark_as_read(current_user, notification_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Notification not found")
    return updated


@router.put("/notifications/read-all")
async def mark_notifications_as_read(current_user: UserPublic = Depends(get_current_user)):
    modified_count = await mark_all_as_read(current_user)
    return {"modified_count": modified_count}


@router.delete("/notifications/{notification_id}")
async def delete_notification_endpoint(
    notification_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    deleted = await delete_notification(current_user, notification_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"deleted": True}


@router.get("/notifications/stream")
async def notifications_stream(current_user: UserPublic = Depends(get_current_user)):
    # Security: rely on Authorization header instead of putting JWT in URL query params.
    return StreamingResponse(
        notification_stream(current_user.id or ""),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
