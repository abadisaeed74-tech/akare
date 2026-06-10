import asyncio
import json
import logging
import ssl
import urllib.error
from urllib import request as urllib_request
from typing import Iterable, Optional

import certifi

from config import BREVO_API_KEY, BREVO_ENABLED, BREVO_FROM_EMAIL, BREVO_FROM_NAME

logger = logging.getLogger(__name__)


def is_brevo_configured() -> bool:
    return BREVO_ENABLED


def _send_email_sync(
    *,
    to_email: str,
    subject: str,
    plain_text: str,
    html_content: Optional[str] = None,
    cc_emails: Optional[Iterable[str]] = None,
) -> None:
    payload = {
        "sender": {"name": BREVO_FROM_NAME, "email": BREVO_FROM_EMAIL},
        "to": [{"email": to_email}],
        "subject": subject,
        "textContent": plain_text,
    }
    if html_content:
        payload["htmlContent"] = html_content
    if cc_emails:
        cleaned = [cc for cc in cc_emails if cc]
        if cleaned:
            payload["cc"] = [{"email": cc} for cc in cleaned]
    req = urllib_request.Request(
        url="https://api.brevo.com/v3/smtp/email",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "api-key": BREVO_API_KEY,
            "accept": "application/json",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    ssl_context = ssl.create_default_context(cafile=certifi.where())
    with urllib_request.urlopen(req, timeout=20, context=ssl_context):
        return


async def send_email(
    *,
    to_email: str,
    subject: str,
    plain_text: str,
    html_content: Optional[str] = None,
    cc_emails: Optional[Iterable[str]] = None,
) -> bool:
    if not is_brevo_configured():
        return False
    if not to_email:
        return False
    try:
        await asyncio.to_thread(
            _send_email_sync,
            to_email=to_email,
            subject=subject,
            plain_text=plain_text,
            html_content=html_content,
            cc_emails=cc_emails,
        )
        return True
    except urllib.error.HTTPError as exc:
        details = ""
        try:
            raw = exc.read()
            details = raw.decode("utf-8", errors="ignore")
        except Exception:
            details = ""
        logger.error(
            "Brevo rejected email: status=%s to=%s subject=%s details=%s",
            exc.code,
            to_email,
            subject,
            details or "<empty>",
        )
        return False
    except Exception:
        logger.exception("Brevo send failed")
        return False
