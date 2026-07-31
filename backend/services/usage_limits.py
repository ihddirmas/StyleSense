"""Monthly usage caps for credit-spending generation endpoints.

There is no billing/tier system live yet (see frontend/app/pricing/page.tsx for the
tiers that are only marketing copy today) so every user is enforced against the
Free tier's advertised cap. Once a real `plan` column + payment flow exists, swap
the flat FREE_TRYON_MONTHLY_LIMIT for a per-user lookup keyed on that column.
"""
import os
from fastapi import HTTPException

from services import supabase_service, analytics_service, email_service

FREE_TRYON_MONTHLY_LIMIT = int(os.getenv("FREE_TRYON_MONTHLY_LIMIT", "5"))
FREE_EVENT_SCENE_MONTHLY_LIMIT = int(os.getenv("FREE_EVENT_SCENE_MONTHLY_LIMIT", "3"))
FREE_ANIMATE_MONTHLY_LIMIT = int(os.getenv("FREE_ANIMATE_MONTHLY_LIMIT", "1"))  # 60cr/5s, keep low

# Comma-separated Supabase auth user IDs exempt from every cap below -- for the
# team's own live-account testing, not a general "unlimited tier" (no plan
# column exists yet, see module docstring).
UNLIMITED_TESTER_USER_IDS = {
    uid.strip() for uid in os.getenv("UNLIMITED_TESTER_USER_IDS", "").split(",") if uid.strip()
}


def _notify_cap_hit(user_id: str, dedupe_key: str, subject: str, body: str) -> None:
    """Send a cap-hit email at most once per user per cap type per month.
    Reuses usage_events as the dedupe ledger -- no schema change needed."""
    if supabase_service.count_usage_events_this_month(user_id, dedupe_key) > 0:
        return
    user = supabase_service.get_user(user_id)
    if not user or not user.get("email"):
        return
    email_service.send(user["email"], subject, body)
    supabase_service.record_usage_event(user_id, dedupe_key)


def tryon_capped(user_id: str) -> bool:
    """Non-raising check so a caller (Aria) can decide whether to even propose a
    try-on before the user tries to confirm it, instead of catching an exception."""
    if user_id in UNLIMITED_TESTER_USER_IDS:
        return False
    return supabase_service.count_tryons_this_month(user_id) >= FREE_TRYON_MONTHLY_LIMIT


def check_tryon_cap(user_id: str) -> None:
    if user_id in UNLIMITED_TESTER_USER_IDS:
        return
    used = supabase_service.count_tryons_this_month(user_id)
    if used >= FREE_TRYON_MONTHLY_LIMIT:
        analytics_service.capture(user_id, "tryon_cap_hit", {"limit": FREE_TRYON_MONTHLY_LIMIT})
        _notify_cap_hit(
            user_id, "cap_email_tryon",
            "You've used all your free try-ons this month",
            f"<p>You've used all {FREE_TRYON_MONTHLY_LIMIT} try-ons on the StyleSense free plan this month. "
            "More capacity is coming soon on paid plans -- we'll let you know when upgrades go live.</p>",
        )
        raise HTTPException(
            402,
            f"You've used all {FREE_TRYON_MONTHLY_LIMIT} try-ons on the free plan this month. "
            "Upgrade for more (coming soon).",
        )


def check_event_scene_cap(user_id: str) -> None:
    if user_id in UNLIMITED_TESTER_USER_IDS:
        return
    used = supabase_service.count_usage_events_this_month(user_id, "event_scene")
    if used >= FREE_EVENT_SCENE_MONTHLY_LIMIT:
        analytics_service.capture(user_id, "event_scene_cap_hit", {"limit": FREE_EVENT_SCENE_MONTHLY_LIMIT})
        _notify_cap_hit(
            user_id, "cap_email_event_scene",
            "You've used all your free event scenes this month",
            f"<p>You've used all {FREE_EVENT_SCENE_MONTHLY_LIMIT} event scenes on the StyleSense free plan "
            "this month. More capacity is coming soon on paid plans -- we'll let you know when upgrades go live.</p>",
        )
        raise HTTPException(
            402,
            f"You've used all {FREE_EVENT_SCENE_MONTHLY_LIMIT} event scenes on the free plan "
            "this month. Upgrade for more (coming soon).",
        )


def check_animate_cap(user_id: str) -> None:
    if user_id in UNLIMITED_TESTER_USER_IDS:
        return
    used = supabase_service.count_usage_events_this_month(user_id, "animate")
    if used >= FREE_ANIMATE_MONTHLY_LIMIT:
        analytics_service.capture(user_id, "animate_cap_hit", {"limit": FREE_ANIMATE_MONTHLY_LIMIT})
        _notify_cap_hit(
            user_id, "cap_email_animate",
            "You've used your free video animation this month",
            f"<p>You've used all {FREE_ANIMATE_MONTHLY_LIMIT} video animations on the StyleSense free plan "
            "this month. More capacity is coming soon on paid plans -- we'll let you know when upgrades go live.</p>",
        )
        raise HTTPException(
            402,
            f"You've used all {FREE_ANIMATE_MONTHLY_LIMIT} video animations on the free plan "
            "this month. Upgrade for more (coming soon).",
        )
