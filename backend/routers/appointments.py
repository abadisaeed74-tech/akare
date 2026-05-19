from typing import Optional

from fastapi import APIRouter, Depends, Query

from dependencies import get_current_user
from models import UserPublic
from services.appointment_service import (
    list_appointments_placeholder_service,
    list_appointments_service,
)

router = APIRouter()

@router.get("/appointments/placeholder")
async def list_appointments_placeholder(current_user: UserPublic = Depends(get_current_user)):
    """
    Placeholder endpoint for upcoming appointments module.
    Keeps frontend integration stable until full appointments model is implemented.
    """
    return await list_appointments_placeholder_service(current_user)


@router.get("/appointments")
async def list_appointments(
    date_filter: Optional[str] = Query(None, description="today | this_week | delayed"),
    employee_id: Optional[str] = Query(None),
    current_user: UserPublic = Depends(get_current_user),
):
    return await list_appointments_service(date_filter, employee_id, current_user)


