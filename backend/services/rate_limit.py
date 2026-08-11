"""Per-user cooldown for expensive (credit-spending) endpoints.

Backed by Redis (atomic SET NX EX) when REDIS_URL is set. Required once
render.yaml runs more than one uvicorn worker (WEB_CONCURRENCY > 1) --
each worker is a separate process, so an in-memory dict no longer holds
shared state and cooldowns would drift per-process. Falls back to the
original in-memory dict when REDIS_URL is unset (e.g. local dev, single
worker), same no-op-until-configured pattern as analytics_service/email_service.
"""
import asyncio
import os
import time
import uuid
from fastapi import HTTPException

REDIS_URL = os.getenv("REDIS_URL", "")

_redis = None
if REDIS_URL:
    import redis
    _redis = redis.from_url(REDIS_URL, decode_responses=True)

_last_call: dict[str, float] = {}  # in-memory fallback, single-process only
_call_timestamps: dict[str, list[float]] = {}  # sliding-window fallback, single-process only

# Prune + count + (conditionally) consume in one round trip so concurrent requests
# across workers can't all observe "under limit" before any of them writes -- a plain
# pipeline (two separate execute() calls) would still race between them.
_CHECK_AND_CONSUME_SCRIPT = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])
local cutoff = now - window

redis.call('ZREMRANGEBYSCORE', key, 0, cutoff)
local count = redis.call('ZCARD', key)

if count + cost > limit then
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local wait = window
    if oldest[2] then
        wait = window - (now - tonumber(oldest[2]))
    end
    if wait < 1 then wait = 1 end
    return wait
end

for i = 5, #ARGV do
    redis.call('ZADD', key, now, ARGV[i])
end
redis.call('EXPIRE', key, window)
return 0
"""


def check_rate_limit(user_id: str, key: str, limit: int, window_seconds: int, cost: int = 1) -> None:
    """Sliding-window request-count limiter: at most `limit` units per `window_seconds`
    for this (user_id, key) pair, where each call consumes `cost` units (default 1).
    Distinct from check_cooldown (min gap between any two calls) -- this bounds burst
    volume instead, e.g. "20 chat messages per minute".

    Blocking (real Redis I/O on the Redis path) -- call via check_rate_limit_async from
    async route handlers so it doesn't stall the event loop."""
    cache_key = f"ratelimit:{user_id}:{key}"

    if _redis:
        now = time.time()
        members = [f"{now}:{uuid.uuid4()}" for _ in range(cost)]
        wait = _redis.eval(_CHECK_AND_CONSUME_SCRIPT, 1, cache_key, now, window_seconds, limit, cost, *members)
        if int(wait) > 0:
            raise HTTPException(429, f"Rate limit exceeded. Please wait {int(wait)}s before trying again.")
        return

    now = time.monotonic()
    cutoff = now - window_seconds
    timestamps = _call_timestamps.get(cache_key, [])
    while timestamps and timestamps[0] <= cutoff:
        timestamps.pop(0)

    if len(timestamps) + cost > limit:
        if timestamps:
            _call_timestamps[cache_key] = timestamps
        else:
            _call_timestamps.pop(cache_key, None)  # nothing left to track -- don't leak an empty entry
        wait = max(1, round(window_seconds - (now - timestamps[0]))) if timestamps else window_seconds
        raise HTTPException(429, f"Rate limit exceeded. Please wait {wait}s before trying again.")

    timestamps.extend([now] * cost)
    _call_timestamps[cache_key] = timestamps


async def check_rate_limit_async(user_id: str, key: str, limit: int, window_seconds: int, cost: int = 1) -> None:
    """check_rate_limit, off the event loop -- use this from async route handlers.
    check_rate_limit's Redis path is a real blocking network round trip; calling it
    directly on the loop thread would stall every other in-flight request on this
    worker for the duration of the call."""
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, check_rate_limit, user_id, key, limit, window_seconds, cost)


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
