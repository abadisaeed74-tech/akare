from fastapi import APIRouter, Depends, File, UploadFile

from dependencies import get_current_user
from models import UserPublic
from services.media_service import upload_file_service

router = APIRouter()


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user: UserPublic = Depends(get_current_user),
):
    return await upload_file_service(file, current_user)
