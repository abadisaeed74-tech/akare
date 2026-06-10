from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional
from zoneinfo import ZoneInfo

UTC_TZ = ZoneInfo("UTC")
RIYADH_TZ = ZoneInfo("Asia/Riyadh")


def _to_utc_datetime(value: Any) -> Optional[datetime]:
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC_TZ)
    return value.astimezone(UTC_TZ)


def _resolve_cancellation_reason(company: Dict[str, Any]) -> Optional[str]:
    raw_status = str(company.get("billing_status") or "").strip().lower()
    if raw_status.startswith("cancelled_by_"):
        return raw_status.replace("cancelled_by_", "", 1) or None
    if raw_status in {"cancelled", "canceled"}:
        return "user_request"
    if raw_status in {"past_due", "unpaid", "incomplete_expired"}:
        return "payment_failed"
    if bool(company.get("cancel_at_period_end", False)) and raw_status != "trialing":
        return "user_request"
    return None


def derive_subscription_snapshot(
    company: Dict[str, Any],
    *,
    now_utc: Optional[datetime] = None,
) -> Dict[str, Any]:
    now = _to_utc_datetime(now_utc) or datetime.now(tz=UTC_TZ)
    raw_status = str(company.get("billing_status") or "").strip().lower()
    ends_at = _to_utc_datetime(company.get("subscription_ends_at"))
    cancellation_reason = _resolve_cancellation_reason(company)

    has_active_period = bool(ends_at and ends_at > now)
    is_subscribed_flag = bool(company.get("is_subscribed", False))

    if ends_at and ends_at <= now:
        subscription_status = "expired"
    elif raw_status == "trialing":
        subscription_status = "trialing"
    elif has_active_period or is_subscribed_flag:
        subscription_status = "active"
    elif cancellation_reason:
        subscription_status = "cancelled"
    else:
        subscription_status = "expired"

    auto_renewal_enabled = bool(subscription_status in {"active", "trialing"})
    if cancellation_reason or bool(company.get("cancel_at_period_end", False)):
        auto_renewal_enabled = False

    end_date_gregorian: Optional[str] = None
    if ends_at:
        end_date_gregorian = ends_at.astimezone(RIYADH_TZ).strftime("%Y-%m-%d")

    effective_is_subscribed = subscription_status in {"active", "trialing"}

    return {
        "subscription_status": subscription_status,
        "cancellation_reason": cancellation_reason,
        "auto_renewal_enabled": auto_renewal_enabled,
        "subscription_end_date_gregorian": end_date_gregorian,
        "effective_is_subscribed": effective_is_subscribed,
        "ends_at_utc": ends_at,
    }
