from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel

from dependencies import get_current_user
from models import UserCreate, UserPublic
from database import get_user_by_email
from services.audit_service import create_audit_log
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
async def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends()):
    try:
        token_payload = await login_service(form_data)
    except HTTPException as exc:
        await create_audit_log(
            action="LOGIN_FAILED",
            entity_type="auth",
            request=request,
            user_email=form_data.username,
            details={"reason": str(exc.detail)},
        )
        raise
    user = await get_user_by_email(form_data.username)
    await create_audit_log(
        action="LOGIN_SUCCESS",
        entity_type="auth",
        current_user=UserPublic(**user) if user else None,
        request=request,
        user_email=form_data.username,
    )
    return token_payload


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

