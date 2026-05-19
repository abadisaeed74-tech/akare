from typing import List

from fastapi import APIRouter, Query, Request, Response

from models import CompanySettings, Property, PropertyInquiryCreate, PropertyInquiryPublic
from services.public_service import (
    create_public_property_inquiry_service,
    get_public_company_service,
    get_public_property_service,
    list_public_company_properties_service,
    public_company_ai_search_service,
    read_root_service,
    resolve_public_video_url_service,
)

router = APIRouter()


@router.get("/")
def read_root():
    return read_root_service()


@router.get("/public/properties/{property_id}", response_model=Property)
async def get_public_property(property_id: str, request: Request, response: Response):
    return await get_public_property_service(property_id, request, response)


@router.get("/public/resolve-video-url")
async def resolve_public_video_url(
    url: str = Query(..., min_length=12, max_length=2048, description="Share URL (e.g. vt.tiktok.com short link)"),
):
    return await resolve_public_video_url_service(url)


@router.post("/public/properties/{property_id}/inquiries", response_model=PropertyInquiryPublic)
async def create_public_property_inquiry(property_id: str, payload: PropertyInquiryCreate):
    return await create_public_property_inquiry_service(property_id, payload)


@router.get("/public/companies/{owner_id}", response_model=CompanySettings)
async def get_public_company(owner_id: str):
    return await get_public_company_service(owner_id)


@router.get("/public/companies/{owner_id}/properties", response_model=List[Property])
async def list_public_company_properties(owner_id: str):
    return await list_public_company_properties_service(owner_id)


@router.get("/public/companies/{owner_id}/ai-search", response_model=List[Property])
async def public_company_ai_search(
    owner_id: str,
    q: str = Query(..., min_length=3),
):
    return await public_company_ai_search_service(owner_id, q)
