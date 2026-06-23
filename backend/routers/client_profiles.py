from typing import List, Optional

from fastapi import APIRouter, Depends, Query, Request

from dependencies import get_current_user
from models import (
    ClientProfileInput,
    ClientProfilePublic,
    ClientProfilesStatsResponse,
    ClientProfileUpdate,
    UserPublic,
)
from services.audit_service import create_audit_log
from services.client_service import (
    create_client_profile_service,
    delete_client_profile_service,
    get_client_profile_service,
    get_client_profiles_stats_service,
    list_client_profiles_service,
    update_client_profile_service,
)

router = APIRouter()

@router.post("/clients/profiles", response_model=ClientProfilePublic, status_code=201)
async def create_client_profile(
    request: Request,
    payload: ClientProfileInput,
    current_user: UserPublic = Depends(get_current_user),
):
    created = await create_client_profile_service(payload, current_user)
    await create_audit_log(
        action="CREATE_CLIENT",
        entity_type="client_profile",
        entity_id=created.id,
        current_user=current_user,
        request=request,
    )
    return created


@router.get("/clients/profiles", response_model=List[ClientProfilePublic])
async def list_client_profiles(
    client_type: Optional[str] = Query(None, description="Filter by type: request or offer"),
    client_name: Optional[str] = Query(None, description="Filter by client name"),
    phone_number: Optional[str] = Query(None, description="Filter by phone number"),
    current_user: UserPublic = Depends(get_current_user),
):
    return await list_client_profiles_service(client_type, client_name, phone_number, current_user)


@router.get("/clients/profiles/{profile_id}", response_model=ClientProfilePublic)
async def get_client_profile(
    profile_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    return await get_client_profile_service(profile_id, current_user)


@router.put("/clients/profiles/{profile_id}", response_model=ClientProfilePublic)
async def update_client_profile(
    request: Request,
    profile_id: str,
    payload: ClientProfileUpdate,
    current_user: UserPublic = Depends(get_current_user),
):
    updated = await update_client_profile_service(profile_id, payload, current_user)
    await create_audit_log(
        action="UPDATE_CLIENT",
        entity_type="client_profile",
        entity_id=updated.id,
        current_user=current_user,
        request=request,
    )
    return updated


@router.delete("/clients/profiles/{profile_id}", status_code=204)
async def delete_client_profile(
    request: Request,
    profile_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    await delete_client_profile_service(profile_id, current_user)
    await create_audit_log(
        action="DELETE_CLIENT",
        entity_type="client_profile",
        entity_id=profile_id,
        current_user=current_user,
        request=request,
    )
    return None


@router.get("/clients/profiles/stats", response_model=ClientProfilesStatsResponse)
async def get_client_profiles_stats(current_user: UserPublic = Depends(get_current_user)):
    stats = await get_client_profiles_stats_service(current_user)
    return ClientProfilesStatsResponse(**stats)


