from database import (
    count_owner_client_offers_db,
    count_owner_client_requests_db,
    count_owner_inquiries_db,
    count_owner_total_views_db,
    count_properties_for_owner,
    get_owner_inquiries_db,
    update_property_inquiry_status_db,
)
from fastapi import HTTPException
from models import DashboardOverview, PropertyInquiryPublic, PropertyInquiryStatusUpdate, UserPublic
from services.property_service import can_view_company_properties
from utils.permissions import require_permission


def _owner_id(current_user: UserPublic):
    return current_user.id if current_user.role == "owner" else current_user.company_owner_id


async def get_dashboard_overview_service(current_user: UserPublic) -> DashboardOverview:
    require_permission(current_user, "can_view_analytics")
    owner_id = _owner_id(current_user)
    if not owner_id or not await can_view_company_properties(owner_id):
        return DashboardOverview(
            total_properties=0,
            total_views=0,
            total_inquiries=0,
            total_client_requests=0,
            total_client_offers=0,
            recent_inquiries=[],
        )

    total_properties = await count_properties_for_owner(owner_id)
    total_views = await count_owner_total_views_db(owner_id)
    total_inquiries = await count_owner_inquiries_db(owner_id)
    total_client_requests = await count_owner_client_requests_db(owner_id)
    total_client_offers = await count_owner_client_offers_db(owner_id)
    recent_raw = await get_owner_inquiries_db(owner_id, limit=20)
    recent = [PropertyInquiryPublic(**r) for r in recent_raw]
    return DashboardOverview(
        total_properties=total_properties,
        total_views=total_views,
        total_inquiries=total_inquiries,
        total_client_requests=total_client_requests,
        total_client_offers=total_client_offers,
        recent_inquiries=recent,
    )


async def update_dashboard_inquiry_status_service(
    inquiry_id: str,
    payload: PropertyInquiryStatusUpdate,
    current_user: UserPublic,
) -> PropertyInquiryPublic:
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="فقط مالك الحساب يمكنه تحديث حالة الاستفسارات.")
    updated = await update_property_inquiry_status_db(current_user.id, inquiry_id, payload.status)
    if not updated:
        raise HTTPException(status_code=404, detail="الاستفسار غير موجود.")
    return PropertyInquiryPublic(**updated)
