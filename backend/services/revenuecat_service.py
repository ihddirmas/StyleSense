"""RevenueCat subscriber entitlement lookup (optional secret key).

Used by usage_limits to raise monthly try-on caps when the mobile app
subscriber has studio/pro entitlements. Without REVENUECAT_SECRET_API_KEY
this module is a no-op and everyone stays on free caps.
"""
from __future__ import annotations

import logging
import os
import time
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

REVENUECAT_SECRET_API_KEY = (os.getenv("REVENUECAT_SECRET_API_KEY") or "").strip()
RC_API = "https://api.revenuecat.com/v1"

# Entitlement lookup_keys configured in the StyleSense RC project
ENTITLEMENT_STUDIO = "studio"
ENTITLEMENT_PRO = "pro"

STUDIO_TRYON_LIMIT = int(os.getenv("STUDIO_TRYON_MONTHLY_LIMIT", "40"))
PRO_TRYON_LIMIT = int(os.getenv("PRO_TRYON_MONTHLY_LIMIT", "100"))

_cache: dict[str, tuple[float, str]] = {}
_CACHE_TTL_SEC = 60


def _fetch_plan(app_user_id: str) -> str:
    if not REVENUECAT_SECRET_API_KEY:
        return "free"
    try:
        resp = httpx.get(
            f"{RC_API}/subscribers/{app_user_id}",
            headers={"Authorization": f"Bearer {REVENUECAT_SECRET_API_KEY}"},
            timeout=8.0,
        )
        if resp.status_code == 404:
            return "free"
        resp.raise_for_status()
        ents = (resp.json().get("subscriber") or {}).get("entitlements") or {}
        if ENTITLEMENT_PRO in ents and not ents[ENTITLEMENT_PRO].get("expires_date"):
            return "pro"
        # Active if expires_date is null or in the future — RC includes only active
        # in some payloads; be permissive on presence.
        if ENTITLEMENT_PRO in ents:
            return "pro"
        if ENTITLEMENT_STUDIO in ents:
            return "studio"
        return "free"
    except Exception as exc:
        logger.warning("RevenueCat subscriber lookup failed for %s: %s", app_user_id, exc)
        return "free"


def get_plan(user_id: str) -> str:
    """Return 'free' | 'studio' | 'pro' for this app user id (Supabase auth uid)."""
    now = time.time()
    hit = _cache.get(user_id)
    if hit and now - hit[0] < _CACHE_TTL_SEC:
        return hit[1]
    plan = _fetch_plan(user_id)
    _cache[user_id] = (now, plan)
    return plan


def tryon_limit_for(user_id: str, free_limit: int) -> int:
    plan = get_plan(user_id)
    if plan == "pro":
        return PRO_TRYON_LIMIT
    if plan == "studio":
        return STUDIO_TRYON_LIMIT
    return free_limit


def invalidate(user_id: str) -> None:
    _cache.pop(user_id, None)
