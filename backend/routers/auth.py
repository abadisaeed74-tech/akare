from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel

from dependencies import get_current_user
from models import UserCreate, UserPublic
from services.auth_service import (
    login_service,
    register_user_service,
    update_my_display_name_service,
    update_my_gemini_key_service,
)

router = APIRouter()


class DisplayNameUpdateRequest(BaseModel):
    display_name: Optional[str] = None


@router.post("/auth/register", response_model=UserPublic)
async def register_user(user_in: UserCreate):
    return await register_user_service(user_in)


@router.post("/auth/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    return await login_service(form_data)


@router.get("/me", response_model=UserPublic)
async def read_me(current_user: UserPublic = Depends(get_current_user)):
    return current_user


@router.put("/me/gemini-key", response_model=UserPublic)
async def update_my_gemini_key(
    gemini_api_key: Optional[str] = Query(None),
    current_user: UserPublic = Depends(get_current_user),
):
    return await update_my_gemini_key_service(current_user, gemini_api_key)


@router.put("/me/display-name", response_model=UserPublic)
async def update_my_display_name(
    payload: DisplayNameUpdateRequest,
    current_user: UserPublic = Depends(get_current_user),
):
    return await update_my_display_name_service(current_user, payload.display_name)

