"""Monthly usage caps for credit-spending generation endpoints.

There is no billing/tier system live yet (see frontend/app/pricing/page.tsx for the
tiers that are only marketing copy today) so every user is enforced against the
Free tier's advertised cap. Once a real `plan` column + payment flow exists, swap
the flat FREE_TRYON_MONTHLY_LIMIT for a per-user lookup keyed on that column.
"""
import os
from fastapi import HTTPException

from services import supabase_service

FREE_TRYON_MONTHLY_LIMIT = int(os.getenv("FREE_TRYON_MONTHLY_LIMIT", "5"))
FREE_EVENT_SCENE_MONTHLY_LIMIT = int(os.getenv("FREE_EVENT_SCENE_MONTHLY_LIMIT", "3"))
FREE_ANIMATE_MONTHLY_LIMIT = int(os.getenv("FREE_ANIMATE_MONTHLY_LIMIT", "1"))  # 60cr/5s, keep low


def check_tryon_cap(user_id: str) -> None:
    used = supabase_service.count_tryons_this_month(user_id)
    if used >= FREE_TRYON_MONTHLY_LIMIT:
        raise HTTPException(
            402,
            f"You've used all {FREE_TRYON_MONTHLY_LIMIT} try-ons on the free plan this month. "
            "Upgrade for more (coming soon).",
        )


def check_event_scene_cap(user_id: str) -> None:
    used = supabase_service.count_usage_events_this_month(user_id, "event_scene")
    if used >= FREE_EVENT_SCENE_MONTHLY_LIMIT:
        raise HTTPException(
            402,
            f"You've used all {FREE_EVENT_SCENE_MONTHLY_LIMIT} event scenes on the free plan "
            "this month. Upgrade for more (coming soon).",
        )


def check_animate_cap(user_id: str) -> None:
    used = supabase_service.count_usage_events_this_month(user_id, "animate")
    if used >= FREE_ANIMATE_MONTHLY_LIMIT:
        raise HTTPException(
            402,
            f"You've used all {FREE_ANIMATE_MONTHLY_LIMIT} video animations on the free plan "
            "this month. Upgrade for more (coming soon).",
        )
