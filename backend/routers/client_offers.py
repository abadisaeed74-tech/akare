from typing import List, Optional

from fastapi import APIRouter, Depends, Query

from dependencies import get_current_user
from models import (
    ClientNoteInput,
    ClientNotePublic,
    ClientNoteUpdate,
    ClientOfferInput,
    ClientOfferPublic,
    ClientOffersStatsResponse,
    ClientOfferUpdate,
    UserPublic,
)
from services.client_service import (
    create_client_offer_note_service,
    create_client_offer_service,
    delete_client_offer_note_service,
    delete_client_offer_service,
    get_client_offer_service,
    get_client_offers_by_client_service,
    get_client_offers_stats_service,
    list_client_offer_notes_service,
    list_client_offers_service,
    update_client_offer_note_service,
    update_client_offer_service,
)

router = APIRouter()

@router.get("/clients/offers")
async def list_client_offers(current_user: UserPublic = Depends(get_current_user)):
    return await list_client_offers_service(current_user)


@router.post("/clients/offers", response_model=ClientOfferPublic, status_code=201)
async def create_client_offer(
    payload: ClientOfferInput,
    current_user: UserPublic = Depends(get_current_user),
):
    return await create_client_offer_service(payload, current_user)


@router.get("/clients/offers/by-client", response_model=List[ClientOfferPublic])
async def get_client_offers_by_client(
    client_name: str = Query(..., min_length=1),
    phone_number: Optional[str] = Query(None),
    profile_id: Optional[str] = Query(None),
    current_user: UserPublic = Depends(get_current_user),
):
    return await get_client_offers_by_client_service(client_name, phone_number, profile_id, current_user)


@router.get("/clients/offers/{offer_id}", response_model=ClientOfferPublic)
async def get_client_offer(
    offer_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    return await get_client_offer_service(offer_id, current_user)


@router.put("/clients/offers/{offer_id}", response_model=ClientOfferPublic)
async def update_client_offer(
    offer_id: str,
    payload: ClientOfferUpdate,
    current_user: UserPublic = Depends(get_current_user),
):
    return await update_client_offer_service(offer_id, payload, current_user)


@router.delete("/clients/offers/{offer_id}", status_code=204)
async def delete_client_offer(
    offer_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    await delete_client_offer_service(offer_id, current_user)
    return None


@router.post("/clients/offers/{offer_id}/notes", response_model=ClientNotePublic, status_code=201)
async def create_client_offer_note(
    offer_id: str,
    payload: ClientNoteInput,
    current_user: UserPublic = Depends(get_current_user),
):
    return await create_client_offer_note_service(offer_id, payload, current_user)


@router.get("/clients/offers/{offer_id}/notes", response_model=List[ClientNotePublic])
async def list_client_offer_notes(
    offer_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    return await list_client_offer_notes_service(offer_id, current_user)


@router.put("/clients/offers/{offer_id}/notes/{note_id}", response_model=ClientNotePublic)
async def update_client_offer_note(
    offer_id: str,
    note_id: str,
    payload: ClientNoteUpdate,
    current_user: UserPublic = Depends(get_current_user),
):
    return await update_client_offer_note_service(offer_id, note_id, payload, current_user)


@router.delete("/clients/offers/{offer_id}/notes/{note_id}", status_code=204)
async def delete_client_offer_note(
    offer_id: str,
    note_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    await delete_client_offer_note_service(offer_id, note_id, current_user)
    return None


@router.get("/clients/offers/stats", response_model=ClientOffersStatsResponse)
async def get_client_offers_stats(current_user: UserPublic = Depends(get_current_user)):
    stats = await get_client_offers_stats_service(current_user)
    return ClientOffersStatsResponse(**stats)


