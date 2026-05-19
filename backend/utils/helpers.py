import re
from typing import Optional
from urllib.parse import urlparse

CITY_ALIASES = {
    "جده": "جدة",
    "جدة": "جدة",
    "الرياض": "الرياض",
    "رياض": "الرياض",
}


def normalize_city(name: Optional[str]) -> Optional[str]:
    if not isinstance(name, str):
        return name
    stripped = name.strip()
    return CITY_ALIASES.get(stripped, stripped)


def normalize_neighborhood(name: Optional[str]) -> Optional[str]:
    if not isinstance(name, str):
        return name
    return name.strip()


def normalize_external_url(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    text = value.strip()
    if not text:
        return None
    if re.match(r"^https?://", text, re.IGNORECASE):
        return text
    return f"https://{text.lstrip('/')}"


def normalize_media_path(value: str) -> str:
    text = (value or "").strip()
    if not text:
        return text
    if text.startswith("/uploads/"):
        return text
    try:
        parsed = urlparse(text)
        if parsed.path.startswith("/uploads/"):
            return parsed.path
    except Exception:
        pass
    return text
