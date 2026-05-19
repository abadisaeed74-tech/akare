from fastapi import APIRouter, Depends

from dependencies import get_current_user
from models import DashboardOverview, PropertyInquiryPublic, PropertyInquiryStatusUpdate, UserPublic
from services.dashboard_service import (
    get_dashboard_overview_service,
    update_dashboard_inquiry_status_service,
)

router = APIRouter()


@router.get("/dashboard/overview", response_model=DashboardOverview)
async def get_dashboard_overview(current_user: UserPublic = Depends(get_current_user)):
    return await get_dashboard_overview_service(current_user)


@router.put("/dashboard/inquiries/{inquiry_id}/status", response_model=PropertyInquiryPublic)
async def update_dashboard_inquiry_status(
    inquiry_id: str,
    payload: PropertyInquiryStatusUpdate,
    current_user: UserPublic = Depends(get_current_user),
):
    return await update_dashboard_inquiry_status_service(inquiry_id, payload, current_user)
