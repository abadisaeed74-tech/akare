import os
from datetime import datetime
from io import BytesIO
from typing import Dict

import cloudinary
import cloudinary.uploader
from fastapi import HTTPException, UploadFile
from PIL import Image

from config import (
    CLOUDINARY_ENABLED,
    CLOUDINARY_FOLDER,
    UPLOAD_DIR,
)
from models import UserPublic
from services.stripe_service import refresh_trial_subscription_state
from utils.permissions import require_permission

MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024  # 10MB
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "pdf"}
ALLOWED_MIME_TYPES = {
    "jpg": {"image/jpeg"},
    "jpeg": {"image/jpeg"},
    "png": {"image/png"},
    "webp": {"image/webp"},
    "pdf": {"application/pdf"},
}
BLOCKED_EXTENSIONS = {"exe", "js", "html", "htm", "svg", "php", "sh", "bat", "dll", "zip", "rar"}


def _extract_extension(filename: str) -> str:
    if "." not in filename:
        return ""
    return filename.rsplit(".", 1)[-1].lower().strip()


def _validate_upload_security(filename: str, content_type: str, content: bytes) -> str:
    ext = _extract_extension(filename)
    if not ext:
        raise HTTPException(status_code=400, detail="امتداد الملف مطلوب.")
    if ext in BLOCKED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="نوع الملف غير مسموح.")
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="يسمح فقط برفع JPG/JPEG/PNG/WEBP/PDF.")

    expected_mimes = ALLOWED_MIME_TYPES.get(ext, set())
    if expected_mimes and content_type not in expected_mimes:
        raise HTTPException(status_code=400, detail="نوع MIME لا يطابق امتداد الملف.")

    if len(content) > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="حجم الملف أكبر من الحد المسموح (10MB).")

    if ext == "pdf":
        # Basic PDF signature validation.
        if not content.startswith(b"%PDF"):
            raise HTTPException(status_code=400, detail="ملف PDF غير صالح.")
    else:
        # Validate image structure with Pillow to reject fake image payloads.
        try:
            with Image.open(BytesIO(content)) as img:
                img.verify()
        except Exception as exc:
            raise HTTPException(status_code=400, detail="ملف الصورة غير صالح.") from exc

    return ext


async def upload_file_service(file: UploadFile, current_user: UserPublic) -> Dict[str, str]:
    require_permission(current_user, "can_manage_files")
    owner_id_for_plan = current_user.id if current_user.role == "owner" else current_user.company_owner_id
    if not owner_id_for_plan:
        raise HTTPException(status_code=400, detail="لا يمكن تحديد شركة الحساب الحالي.")
    company_for_plan = await refresh_trial_subscription_state(owner_id_for_plan)
    if not company_for_plan.get("is_subscribed", False):
        raise HTTPException(
            status_code=403,
            detail="لا يمكنك رفع ملفات ومرفقات قبل الاشتراك في إحدى الخطط. يرجى ترقية الحساب من صفحة الإعدادات.",
        )

    original_name = file.filename or "file"
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S%f")
    safe_name = "".join(c for c in original_name if c.isalnum() or c in {".", "_", "-"}) or "file"
    filename = f"{timestamp}_{safe_name}"

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="الملف فارغ، يرجى اختيار ملف صالح.")
    ext = _validate_upload_security(filename, (file.content_type or "").lower().strip(), content)

    if CLOUDINARY_ENABLED:
        try:
            cloud_resource_type = "raw" if ext == "pdf" else "image"
            result = cloudinary.uploader.upload(
                content,
                resource_type=cloud_resource_type,
                folder=CLOUDINARY_FOLDER,
                public_id=filename,
                overwrite=False,
                use_filename=False,
                unique_filename=False,
            )
            cloud_url = result.get("secure_url") or result.get("url")
            if not cloud_url:
                raise RuntimeError("Cloudinary did not return a URL.")
            return {"url": cloud_url}
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail="تعذر رفع الملف إلى Cloudinary. يرجى المحاولة لاحقًا.",
            ) from exc

    file_path = os.path.join(UPLOAD_DIR, filename)
    with open(file_path, "wb") as f:
        f.write(content)
    return {"url": f"/uploads/{filename}"}
