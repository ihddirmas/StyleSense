"""Lightweight per-user cooldown for expensive (credit-spending) endpoints.

Plain in-memory dict, not Redis. Safe only because the app deploys as a single
Render instance with a single uvicorn worker (no --workers flag, see render.yaml) --
there's exactly one process holding this state, so no cross-process drift.
If this ever moves to multiple workers/instances, swap for a shared store.
"""
import time
from fastapi import HTTPException

_last_call: dict[str, float] = {}


def check_cooldown(user_id: str, key: str, seconds: int) -> None:
    now = time.monotonic()
    cache_key = f"{user_id}:{key}"
    last = _last_call.get(cache_key)
    if last is not None:
        elapsed = now - last
        if elapsed < seconds:
            wait = round(seconds - elapsed)
            raise HTTPException(429, f"Please wait {wait}s before generating again.")
    _last_call[cache_key] = now
