import logging
import re
import ssl
import urllib.request
from typing import Dict, List
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse

import certifi
from fastapi import HTTPException, Request, Response
from starlette.concurrency import run_in_threadpool

from config import FRONTEND_BASE_URL
from database import (
    create_property_inquiry_db,
    get_all_cities,
    get_company_by_owner_id,
    get_properties,
    get_property_by_id,
    increment_property_view_count,
)
from models import CompanySettings, Property, PropertyInquiryCreate, PropertyInquiryPublic
from services.stripe_service import company_settings_response
from services.notification_service import create_owner_team_notification
from utils.helpers import normalize_city


def read_root_service() -> Dict[str, str]:
    return {"message": "Welcome to the Akare Real Estate AI Backend"}


def _sanitize_public_property(prop: Dict[str, object]) -> Dict[str, object]:
    """
    Public property responses must not expose internal owner/private fields.
    """
    sanitized = dict(prop or {})
    sanitized["owner_name"] = None
    sanitized["owner_contact_number"] = None
    sanitized["owner_id"] = None
    sanitized["raw_text"] = ""
    return sanitized


async def get_public_property_service(property_id: str, request: Request, response: Response) -> Property:
    cookie_name = f"viewed_property_{re.sub(r'[^A-Za-z0-9_-]', '_', property_id)}"
    skip_incr = (request.headers.get("x-akare-skip-view-count") or "").strip() == "1"
    has_recent_view = skip_incr or request.cookies.get(cookie_name) == "1"
    prop = await get_property_by_id(property_id) if has_recent_view else await increment_property_view_count(property_id)
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    if not has_recent_view:
        response.set_cookie(
            key=cookie_name,
            value="1",
            max_age=60 * 60 * 24,
            httponly=True,
            samesite="none" if FRONTEND_BASE_URL.startswith("https://") else "lax",
            secure=FRONTEND_BASE_URL.startswith("https://"),
            path="/",
        )
    return Property(**_sanitize_public_property(prop))


def _tiktok_resolve_host_allowed(host: str) -> bool:
    h = (host or "").lower()
    return bool(h) and (h == "tiktok.com" or h.endswith(".tiktok.com"))


def _follow_redirects_get_final_url_sync(url: str) -> str:
    req = urllib.request.Request(
        url,
        method="GET",
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        },
    )
    ctx = ssl.create_default_context(cafile=certifi.where())
    with urllib.request.urlopen(req, timeout=25, context=ctx) as resp:
        try:
            resp.read(65536)
        except Exception:
            pass
        return resp.geturl()


async def resolve_public_video_url_service(url: str) -> Dict[str, str]:
    raw = (url or "").strip()
    if not raw.startswith(("http://", "https://")):
        raw = "https://" + raw.lstrip("/")
    try:
        parsed = urlparse(raw)
    except Exception:
        raise HTTPException(status_code=400, detail="رابط غير صالح.")
    host = (parsed.hostname or "").lower()
    if not _tiktok_resolve_host_allowed(host):
        raise HTTPException(status_code=400, detail="يُسمح فقط بروابط TikTok.")
    try:
        final_url = await run_in_threadpool(_follow_redirects_get_final_url_sync, raw)
    except (URLError, HTTPError, TimeoutError, OSError) as exc:
        logging.exception("resolve_public_video_url: %s", exc)
        raise HTTPException(status_code=502, detail="تعذر استرجاع الرابط النهائي.")
    except Exception as exc:
        logging.exception("resolve_public_video_url: %s", exc)
        raise HTTPException(status_code=502, detail="تعذر استرجاع الرابط النهائي.")
    if not _tiktok_resolve_host_allowed(urlparse(final_url).hostname or ""):
        raise HTTPException(status_code=400, detail="الرابط النهائي ليس على TikTok.")
    return {"url": final_url}


async def create_public_property_inquiry_service(property_id: str, payload: PropertyInquiryCreate) -> PropertyInquiryPublic:
    prop = await get_property_by_id(property_id)
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    owner_id = prop.get("owner_id")
    if not owner_id:
        raise HTTPException(status_code=400, detail="لا يمكن إرسال استفسار لهذا العرض.")
    message_text = (payload.message or "").strip()
    if not message_text:
        raise HTTPException(status_code=400, detail="الرجاء كتابة نص الاستفسار.")
    inquiry = await create_property_inquiry_db(
        property_id=property_id,
        owner_id=owner_id,
        property_title=f"{prop.get('property_type', 'عقار')} في {prop.get('neighborhood', 'غير مذكور')}",
        city=prop.get("city"),
        neighborhood=prop.get("neighborhood"),
        name=(payload.name or "").strip() or None,
        phone=(payload.phone or "").strip() or None,
        message=message_text,
    )
    await create_owner_team_notification(
        owner_id=owner_id,
        type="property_inquiry",
        category="properties",
        title="استفسار جديد على عقار",
        message=f"تم استلام استفسار جديد على العرض {prop.get('property_code') or ''}.",
        priority="high",
        link="/app?section=overview",
        metadata={"property_id": property_id, "inquiry_id": inquiry.get("id", "")},
    )
    return PropertyInquiryPublic(**inquiry)


async def get_public_company_service(owner_id: str) -> CompanySettings:
    company = await get_company_by_owner_id(owner_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company_settings_response(company)


async def list_public_company_properties_service(owner_id: str) -> List[Property]:
    props = await get_properties({"owner_id": owner_id})
    return [Property(**_sanitize_public_property(p)) for p in props]


async def public_company_ai_search_service(owner_id: str, q: str) -> List[Property]:
    text = q.strip()
    query: Dict[str, object] = {"owner_id": owner_id}
    try:
        cities = await get_all_cities(owner_id)
    except Exception:
        cities = []
    if isinstance(cities, list):
        for c in cities:
            if isinstance(c, str) and c and c in text:
                query["city"] = normalize_city(c)
                break
    if "أرض" in text or "ارض" in text:
        query["property_type"] = {"$regex": "أرض", "$options": "i"}
    elif "فيلا" in text or "فيلا" in text:
        query["property_type"] = "فيلا"
    elif "عمارة" in text or "عماره" in text:
        query["property_type"] = "عمارة"
    m = re.search(r"(\d+)\s*(متر|م)", text)
    if m:
        area = float(m.group(1))
        query["area"] = {"$gte": area * 0.8, "$lte": area * 1.2}
    properties = await get_properties(query)
    if properties:
        return [Property(**_sanitize_public_property(p)) for p in properties]
    search_query = {
        "owner_id": owner_id,
        "$or": [
            {"city": {"$regex": q, "$options": "i"}},
            {"neighborhood": {"$regex": q, "$options": "i"}},
            {"details": {"$regex": q, "$options": "i"}},
            {"owner_name": {"$regex": q, "$options": "i"}},
            {"owner_contact_number": {"$regex": q, "$options": "i"}},
            {"marketer_contact_number": {"$regex": q, "$options": "i"}},
            {"raw_text": {"$regex": q, "$options": "i"}},
        ],
    }
    rows = await get_properties(search_query)
    return [Property(**_sanitize_public_property(p)) for p in rows]
