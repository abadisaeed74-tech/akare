from typing import List

from fastapi import APIRouter, Depends

from dependencies import get_current_user
from models import (
    ClientNoteInput,
    ClientNotePublic,
    ClientRequestsStatsResponse,
    ClientNoteUpdate,
    ClientRequestInput,
    ClientRequestPublic,
    ClientRequestUpdate,
    Property,
    UserPublic,
)
from services.client_service import (
    create_client_request_note_service,
    create_client_request_service,
    delete_client_request_note_service,
    delete_client_request_service,
    get_client_request_matches_service,
    get_client_requests_stats_service,
    list_client_request_notes_service,
    list_client_requests_service,
    update_client_request_note_service,
    update_client_request_service,
)

router = APIRouter()

@router.post("/clients", response_model=ClientRequestPublic, status_code=201)
async def create_client_request_endpoint(
    payload: ClientRequestInput,
    current_user: UserPublic = Depends(get_current_user),
):
    return await create_client_request_service(payload, current_user)


@router.get("/clients", response_model=List[ClientRequestPublic])
async def list_client_requests_endpoint(current_user: UserPublic = Depends(get_current_user)):
    return await list_client_requests_service(current_user)


@router.get("/clients/{request_id}/matches", response_model=List[Property])
async def get_client_request_matches(
    request_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    return await get_client_request_matches_service(request_id, current_user)


@router.post("/clients/{request_id}/notes", response_model=ClientNotePublic, status_code=201)
async def create_client_request_note(
    request_id: str,
    payload: ClientNoteInput,
    current_user: UserPublic = Depends(get_current_user),
):
    return await create_client_request_note_service(request_id, payload, current_user)


@router.get("/clients/{request_id}/notes", response_model=List[ClientNotePublic])
async def list_client_request_notes(
    request_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    return await list_client_request_notes_service(request_id, current_user)


@router.put("/clients/{request_id}/notes/{note_id}", response_model=ClientNotePublic)
async def update_client_request_note(
    request_id: str,
    note_id: str,
    payload: ClientNoteUpdate,
    current_user: UserPublic = Depends(get_current_user),
):
    return await update_client_request_note_service(request_id, note_id, payload, current_user)


@router.delete("/clients/{request_id}/notes/{note_id}", status_code=204)
async def delete_client_request_note(
    request_id: str,
    note_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    await delete_client_request_note_service(request_id, note_id, current_user)
    return None


@router.put("/clients/{request_id}", response_model=ClientRequestPublic)
async def update_client_request_endpoint(
    request_id: str,
    payload: ClientRequestUpdate,
    current_user: UserPublic = Depends(get_current_user),
):
    return await update_client_request_service(request_id, payload, current_user)


@router.delete("/clients/{request_id}", status_code=204)
async def delete_client_request_endpoint(
    request_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    await delete_client_request_service(request_id, current_user)
    return None


@router.get("/clients/requests/stats", response_model=ClientRequestsStatsResponse)
async def get_client_requests_stats(current_user: UserPublic = Depends(get_current_user)):
    stats = await get_client_requests_stats_service(current_user)
    return ClientRequestsStatsResponse(**stats)


