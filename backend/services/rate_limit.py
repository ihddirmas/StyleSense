"""Per-user cooldown for expensive (credit-spending) endpoints.

Backed by Redis (atomic SET NX EX) when REDIS_URL is set. Required once
render.yaml runs more than one uvicorn worker (WEB_CONCURRENCY > 1) --
each worker is a separate process, so an in-memory dict no longer holds
shared state and cooldowns would drift per-process. Falls back to the
original in-memory dict when REDIS_URL is unset (e.g. local dev, single
worker), same no-op-until-configured pattern as analytics_service/email_service.
"""
import os
import time
from fastapi import HTTPException

REDIS_URL = os.getenv("REDIS_URL", "")

_redis = None
if REDIS_URL:
    import redis
    _redis = redis.from_url(REDIS_URL, decode_responses=True)

_last_call: dict[str, float] = {}  # in-memory fallback, single-process only


def check_cooldown(user_id: str, key: str, seconds: int) -> None:
    cache_key = f"cooldown:{user_id}:{key}"

    if _redis:
        # SET NX EX claims the cooldown slot atomically -- no separate
        # check-then-set race window across concurrent workers/requests.
        if not _redis.set(cache_key, "1", nx=True, ex=seconds):
            wait = _redis.ttl(cache_key)
            raise HTTPException(429, f"Please wait {max(wait, 1)}s before generating again.")
        return

    now = time.monotonic()
    last = _last_call.get(cache_key)
    if last is not None:
        elapsed = now - last
        if elapsed < seconds:
            wait = round(seconds - elapsed)
            raise HTTPException(429, f"Please wait {wait}s before generating again.")
    _last_call[cache_key] = now
