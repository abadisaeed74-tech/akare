from fastapi import HTTPException
from models import UserPublic


DEFAULT_EMPLOYEE_PERMISSIONS = {
    "can_add_property": True,
    "can_edit_property": True,
    "can_delete_property": False,
    "can_manage_files": True,
    "can_view_all_properties": False,
    "can_view_assigned_only": True,
    "can_manage_clients": True,
    "can_view_all_clients": False,
    "can_view_own_clients_only": True,
    "can_manage_appointments": True,
    "can_view_analytics": False,
    "can_export_data": False,
    "can_change_assignee": False,
}

MANAGER_DEFAULT_PERMISSIONS = {
    "can_add_property": True,
    "can_edit_property": True,
    "can_delete_property": True,
    "can_manage_files": True,
    "can_view_all_properties": True,
    "can_view_assigned_only": True,
    "can_manage_clients": True,
    "can_view_all_clients": True,
    "can_view_own_clients_only": True,
    "can_manage_appointments": True,
    "can_view_analytics": True,
    "can_export_data": True,
    "can_change_assignee": True,
}


def _permissions_to_dict(permissions: object | None) -> dict:
    if permissions is None:
        return {}
    if isinstance(permissions, dict):
        return permissions
    model_dump = getattr(permissions, "model_dump", None)
    if callable(model_dump):
        try:
            return dict(model_dump(exclude_none=True))
        except Exception:
            return {}
    legacy_dict = getattr(permissions, "dict", None)
    if callable(legacy_dict):
        try:
            return dict(legacy_dict(exclude_none=True))
        except Exception:
            return {}
    return {}


def normalize_permissions(role: str, permissions: object | None) -> dict:
    perms = _permissions_to_dict(permissions)
    base = MANAGER_DEFAULT_PERMISSIONS if role == "manager" else DEFAULT_EMPLOYEE_PERMISSIONS
    merged = dict(base)
    merged.update({k: bool(v) for k, v in perms.items() if k in merged})

    # Backward-compat: old employees only had 4 keys and used to see all data.
    legacy_keys = {"can_add_property", "can_edit_property", "can_delete_property", "can_manage_files"}
    if role == "employee" and perms and set(perms.keys()).issubset(legacy_keys):
        merged["can_view_all_properties"] = True
        merged["can_view_assigned_only"] = False
        merged["can_view_all_clients"] = True
        merged["can_view_own_clients_only"] = False
        merged["can_view_analytics"] = True
    return merged


def has_permission(user: UserPublic, permission: str) -> bool:
    if user.role == "owner":
        return True
    perms = normalize_permissions(user.role or "employee", user.permissions or {})
    return bool(perms.get(permission))


def require_permission(user: UserPublic, permission: str) -> None:
    if has_permission(user, permission):
        return
    if permission == "can_add_property":
        detail = "لا تملك صلاحية إضافة عروض عقارية في هذه الشركة."
    elif permission == "can_edit_property":
        detail = "لا تملك صلاحية تعديل العروض العقارية في هذه الشركة."
    elif permission == "can_delete_property":
        detail = "لا تملك صلاحية حذف العروض العقارية في هذه الشركة."
    elif permission == "can_manage_files":
        detail = "لا تملك صلاحية إدارة الملفات والمرفقات في هذه الشركة."
    elif permission == "can_view_analytics":
        detail = "لا تملك صلاحية مشاهدة التحليلات."
    elif permission == "can_manage_clients":
        detail = "لا تملك صلاحية إدارة العملاء."
    elif permission == "can_manage_appointments":
        detail = "لا تملك صلاحية إدارة المواعيد."
    elif permission == "can_export_data":
        detail = "لا تملك صلاحية تصدير البيانات."
    elif permission == "can_change_assignee":
        detail = "لا تملك صلاحية تغيير الموظف المسؤول."
    else:
        detail = "لا تملك الصلاحية اللازمة لتنفيذ هذه العملية."
    raise HTTPException(status_code=403, detail=detail)
