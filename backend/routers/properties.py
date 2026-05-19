from typing import List, Optional

from fastapi import APIRouter, Depends, Query

from dependencies import get_current_user
from models import Property, PropertyInput, PropertyUpdate, UserPublic
from services.property_service import (
    ai_search_properties_service,
    create_property_service,
    delete_properties_by_city_service,
    delete_properties_by_neighborhood_service,
    delete_property_by_raw_text_service,
    delete_property_service,
    list_cities_service,
    list_neighborhoods_service,
    list_properties_service,
    search_properties_service,
    update_property_service,
)

router = APIRouter()

@router.post("/properties", response_model=Property, status_code=201)
async def create_property_endpoint(
    property_input: PropertyInput,
    current_user: UserPublic = Depends(get_current_user),
):
    return await create_property_service(property_input, current_user)


@router.put("/properties/{property_id}", response_model=Property)
async def update_property_endpoint(
    property_id: str,
    updates: PropertyUpdate,
    current_user: UserPublic = Depends(get_current_user),
):
    return await update_property_service(property_id, updates, current_user)


@router.delete("/properties/id/{property_id}", status_code=204)
async def delete_property_endpoint(
    property_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    await delete_property_service(property_id, current_user)
    return None


@router.delete("/properties/by-raw-text", status_code=204)
async def delete_property_by_raw_text_endpoint(
    raw_text: str = Query(..., min_length=1),
    current_user: UserPublic = Depends(get_current_user),
):
    await delete_property_by_raw_text_service(raw_text, current_user)
    return None


@router.delete("/properties/by-city", status_code=204)
async def delete_properties_by_city_endpoint(
    city: str = Query(..., min_length=1),
    current_user: UserPublic = Depends(get_current_user),
):
    await delete_properties_by_city_service(city, current_user)
    return None


@router.delete("/properties/by-neighborhood", status_code=204)
async def delete_properties_by_neighborhood_endpoint(
    neighborhood: str = Query(..., min_length=1),
    city: Optional[str] = Query(None),
    current_user: UserPublic = Depends(get_current_user),
):
    await delete_properties_by_neighborhood_service(neighborhood, city, current_user)
    return None


@router.get("/properties", response_model=List[Property])
async def list_properties_endpoint(
    city: Optional[str] = None,
    neighborhood: Optional[str] = None,
    property_type: Optional[str] = None,
    min_area: Optional[float] = None,
    max_area: Optional[float] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    current_user: UserPublic = Depends(get_current_user),
):
    return await list_properties_service(
        city,
        neighborhood,
        property_type,
        min_area,
        max_area,
        min_price,
        max_price,
        current_user,
    )


@router.get("/cities", response_model=List[str])
async def list_cities_endpoint(current_user: UserPublic = Depends(get_current_user)):
    return await list_cities_service(current_user)


@router.get("/neighborhoods", response_model=List[str])
async def list_neighborhoods_endpoint(
    city: Optional[str] = None,
    current_user: UserPublic = Depends(get_current_user),
):
    return await list_neighborhoods_service(city, current_user)


@router.get("/search", response_model=List[Property])
async def search_properties_endpoint(
    q: str = Query(..., min_length=1),
    current_user: UserPublic = Depends(get_current_user),
):
    return await search_properties_service(q, current_user)


@router.get("/ai-search", response_model=List[Property])
async def ai_search_properties_endpoint(
    q: str = Query(..., min_length=3),
    current_user: UserPublic = Depends(get_current_user),
):
    return await ai_search_properties_service(q, current_user)

