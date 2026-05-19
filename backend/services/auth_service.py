from typing import Optional

from fastapi import HTTPException
from fastapi.security import OAuth2PasswordRequestForm

from database import (
    create_user,
    get_user_by_email,
    update_user_display_name,
    update_user_gemini_key,
    user_collection,
)
from models import UserCreate, UserPublic
from utils.security import create_access_token, get_password_hash, verify_password


async def register_user_service(user_in: UserCreate) -> UserPublic:
    existing = await get_user_by_email(user_in.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    if len(user_in.password.encode("utf-8")) > 72:
        raise HTTPException(
            status_code=400,
            detail="كلمة المرور طويلة جداً، الرجاء استخدام كلمة مرور أقصر (أقل من 72 حرف/بايت).",
        )

    hashed = get_password_hash(user_in.password)
    user = await create_user(user_in.email, hashed, None)
    return UserPublic(**user)


async def login_service(form_data: OAuth2PasswordRequestForm) -> dict:
    user = await get_user_by_email(form_data.username)
    if not user:
        raise HTTPException(status_code=400, detail="Incorrect email or password")

    db_user = await user_collection.find_one({"email": form_data.username})
    if not db_user or not verify_password(form_data.password, db_user.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="Incorrect email or password")

    access_token = create_access_token(data={"sub": str(db_user["_id"])})
    return {"access_token": access_token, "token_type": "bearer"}


async def update_my_gemini_key_service(current_user: UserPublic, gemini_api_key: Optional[str]) -> UserPublic:
    _ = gemini_api_key
    updated = await update_user_gemini_key(current_user.id, None)
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")
    return UserPublic(**updated)


async def update_my_display_name_service(current_user: UserPublic, display_name: Optional[str]) -> UserPublic:
    normalized = (display_name or "").strip() or None
    updated = await update_user_display_name(current_user.id, normalized)
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")
    return UserPublic(**updated)
