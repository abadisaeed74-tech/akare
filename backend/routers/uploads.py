from fastapi import APIRouter, Depends, File, Request, UploadFile

from dependencies import get_current_user
from models import UserPublic
from services.audit_service import create_audit_log
from services.media_service import upload_file_service

router = APIRouter()


@router.post("/upload")
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    current_user: UserPublic = Depends(get_current_user),
):
    result = await upload_file_service(file, current_user)
    await create_audit_log(
        action="UPLOAD_FILE",
        entity_type="file",
        entity_id=result.get("url"),
        current_user=current_user,
        request=request,
        details={"filename": file.filename or "unknown"},
    )
    return result
