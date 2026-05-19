from typing import List

from fastapi import APIRouter, Depends

from dependencies import get_current_user
from models import (
    MarketingAnalytics,
    MarketingEventCreate,
    MarketingLandingPageDetails,
    MarketingLandingPageStat,
    MarketingLeadConvertRequest,
    MarketingLeadCreate,
    MarketingLeadPublic,
    MarketingLeadStatusUpdate,
    MarketingLeadUpdate,
    MarketingOverview,
    UserPublic,
)
from services.analytics_service import (
    convert_marketing_lead_service,
    create_public_marketing_event_service,
    create_public_marketing_lead_service,
    get_marketing_analytics_service,
    get_marketing_landing_page_details_service,
    get_marketing_landing_pages_service,
    get_marketing_leads_service,
    get_marketing_overview_service,
    update_marketing_lead_service,
    update_marketing_lead_status_service,
)

router = APIRouter()

@router.post("/public/marketing/events", status_code=204)
async def create_public_marketing_event(payload: MarketingEventCreate):
    return await create_public_marketing_event_service(payload)


@router.post("/public/marketing/leads", response_model=MarketingLeadPublic, status_code=201)
async def create_public_marketing_lead(payload: MarketingLeadCreate):
    return await create_public_marketing_lead_service(payload)


@router.get("/marketing/overview", response_model=MarketingOverview)
async def get_marketing_overview(current_user: UserPublic = Depends(get_current_user)):
    return await get_marketing_overview_service(current_user)


@router.get("/marketing/leads", response_model=List[MarketingLeadPublic])
async def get_marketing_leads(current_user: UserPublic = Depends(get_current_user)):
    return await get_marketing_leads_service(current_user)


@router.put("/marketing/leads/{lead_id}/status", response_model=MarketingLeadPublic)
async def update_marketing_lead_status(
    lead_id: str,
    payload: MarketingLeadStatusUpdate,
    current_user: UserPublic = Depends(get_current_user),
):
    return await update_marketing_lead_status_service(lead_id, payload, current_user)


@router.put("/marketing/leads/{lead_id}", response_model=MarketingLeadPublic)
async def update_marketing_lead(
    lead_id: str,
    payload: MarketingLeadUpdate,
    current_user: UserPublic = Depends(get_current_user),
):
    return await update_marketing_lead_service(lead_id, payload, current_user)


@router.post("/marketing/leads/{lead_id}/convert", response_model=MarketingLeadPublic)
async def convert_marketing_lead(
    lead_id: str,
    payload: MarketingLeadConvertRequest,
    current_user: UserPublic = Depends(get_current_user),
):
    return await convert_marketing_lead_service(lead_id, payload, current_user)


@router.get("/marketing/landing-pages", response_model=List[MarketingLandingPageStat])
async def get_marketing_landing_pages(current_user: UserPublic = Depends(get_current_user)):
    return await get_marketing_landing_pages_service(current_user)


@router.get("/marketing/landing-pages/{property_id}/details", response_model=MarketingLandingPageDetails)
async def get_marketing_landing_page_details(
    property_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    return await get_marketing_landing_page_details_service(property_id, current_user)


@router.get("/marketing/analytics", response_model=MarketingAnalytics)
async def get_marketing_analytics(current_user: UserPublic = Depends(get_current_user)):
    return await get_marketing_analytics_service(current_user)


