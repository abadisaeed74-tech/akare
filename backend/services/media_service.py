import os
from datetime import datetime
from typing import Dict

import cloudinary
import cloudinary.uploader
from fastapi import HTTPException, UploadFile

from config import (
    CLOUDINARY_ENABLED,
    CLOUDINARY_FOLDER,
    UPLOAD_DIR,
)
from models import UserPublic
from services.stripe_service import refresh_trial_subscription_state
from utils.permissions import require_permission


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
    lower_name = original_name.lower()
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S%f")
    safe_name = "".join(c for c in original_name if c.isalnum() or c in {".", "_", "-"}) or "file"
    filename = f"{timestamp}_{safe_name}"

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="الملف فارغ، يرجى اختيار ملف صالح.")

    if CLOUDINARY_ENABLED:
        try:
            cloud_resource_type = "raw" if lower_name.endswith(".pdf") else "auto"
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
