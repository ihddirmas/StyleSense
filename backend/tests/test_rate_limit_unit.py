"""
Unit tests for rate_limit.check_rate_limit / check_rate_limit_async
(sliding-window request-count limiter).

The in-memory-fallback tests need no network. The Redis-path tests use fakeredis
(in-process fake server, no real Redis needed) via the `lupa` Lua runtime so EVAL
(the atomic check-and-consume script) actually executes. Run with:
    .\\venv\\Scripts\\python.exe -m pytest tests/test_rate_limit_unit.py -v
"""
import asyncio
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import fakeredis
import pytest
from fastapi import HTTPException

from services import rate_limit


@pytest.fixture(autouse=True)
def _clean_state():
    rate_limit._call_timestamps.clear()
    yield
    rate_limit._call_timestamps.clear()


def test_allows_calls_under_the_limit():
    for _ in range(3):
        rate_limit.check_rate_limit("user-1", "chat", limit=5, window_seconds=60)
    # no exception raised


def test_blocks_the_call_that_exceeds_the_limit():
    for _ in range(3):
        rate_limit.check_rate_limit("user-1", "chat", limit=3, window_seconds=60)
    with pytest.raises(HTTPException) as exc_info:
        rate_limit.check_rate_limit("user-1", "chat", limit=3, window_seconds=60)
    assert exc_info.value.status_code == 429


def test_allows_calls_again_once_the_window_has_passed(monkeypatch):
    clock = {"t": 1000.0}
    monkeypatch.setattr(rate_limit.time, "monotonic", lambda: clock["t"])

    for _ in range(2):
        rate_limit.check_rate_limit("user-1", "chat", limit=2, window_seconds=10)
    with pytest.raises(HTTPException):
        rate_limit.check_rate_limit("user-1", "chat", limit=2, window_seconds=10)

    clock["t"] += 10.001  # past the window
    rate_limit.check_rate_limit("user-1", "chat", limit=2, window_seconds=10)  # no raise


def test_limit_is_scoped_independently_per_key():
    rate_limit.check_rate_limit("user-1", "chat", limit=1, window_seconds=60)
    with pytest.raises(HTTPException):
        rate_limit.check_rate_limit("user-1", "chat", limit=1, window_seconds=60)
    # a different key for the same user has its own untouched budget
    rate_limit.check_rate_limit("user-1", "upload", limit=1, window_seconds=60)


def test_limit_is_scoped_independently_per_user():
    rate_limit.check_rate_limit("user-1", "chat", limit=1, window_seconds=60)
    with pytest.raises(HTTPException):
        rate_limit.check_rate_limit("user-1", "chat", limit=1, window_seconds=60)
    # a different user on the same key has their own untouched budget
    rate_limit.check_rate_limit("user-2", "chat", limit=1, window_seconds=60)


def test_blocked_call_reports_seconds_to_wait(monkeypatch):
    clock = {"t": 1000.0}
    monkeypatch.setattr(rate_limit.time, "monotonic", lambda: clock["t"])

    rate_limit.check_rate_limit("user-1", "chat", limit=1, window_seconds=10)
    clock["t"] += 4  # 6s left in the window
    with pytest.raises(HTTPException) as exc_info:
        rate_limit.check_rate_limit("user-1", "chat", limit=1, window_seconds=10)
    assert "6s" in exc_info.value.detail


def test_cost_consumes_multiple_units_in_one_call():
    # add-multi-style: one call can consume more than 1 unit of budget.
    rate_limit.check_rate_limit("user-1", "wardrobe-write", limit=10, window_seconds=60, cost=7)
    with pytest.raises(HTTPException):
        # only 3 units left; a cost of 4 should be rejected outright (no partial consumption)
        rate_limit.check_rate_limit("user-1", "wardrobe-write", limit=10, window_seconds=60, cost=4)
    rate_limit.check_rate_limit("user-1", "wardrobe-write", limit=10, window_seconds=60, cost=3)  # exactly fits


def test_emptied_key_is_removed_from_memory_not_left_dangling():
    rate_limit.check_rate_limit("user-1", "chat", limit=1, window_seconds=60)
    assert "ratelimit:user-1:chat" in rate_limit._call_timestamps
    with pytest.raises(HTTPException):
        # a rejected call must not create/leave a dangling empty entry for a key
        # that was never actually consumed
        rate_limit.check_rate_limit("user-2", "chat", limit=0, window_seconds=60)
    assert "ratelimit:user-2:chat" not in rate_limit._call_timestamps


class TestAsyncWrapper:
    def test_delegates_to_check_rate_limit_and_propagates_the_block(self):
        async def _run():
            for _ in range(2):
                await rate_limit.check_rate_limit_async("user-1", "chat", limit=2, window_seconds=60)
            with pytest.raises(HTTPException):
                await rate_limit.check_rate_limit_async("user-1", "chat", limit=2, window_seconds=60)

        asyncio.run(_run())


class TestRedisPath:
    """Exercises the real Redis code path (Lua EVAL script) against fakeredis --
    the path the earlier plain-pipeline implementation raced under concurrency."""

    @pytest.fixture(autouse=True)
    def _fake_redis(self, monkeypatch):
        fake = fakeredis.FakeStrictRedis(decode_responses=True)
        monkeypatch.setattr(rate_limit, "_redis", fake)
        yield fake
        fake.flushall()

    def test_allows_calls_under_the_limit(self):
        for _ in range(3):
            rate_limit.check_rate_limit("user-1", "chat", limit=5, window_seconds=60)

    def test_blocks_the_call_that_exceeds_the_limit(self):
        for _ in range(3):
            rate_limit.check_rate_limit("user-1", "chat", limit=3, window_seconds=60)
        with pytest.raises(HTTPException) as exc_info:
            rate_limit.check_rate_limit("user-1", "chat", limit=3, window_seconds=60)
        assert exc_info.value.status_code == 429

    def test_cost_greater_than_remaining_budget_is_rejected_atomically(self):
        rate_limit.check_rate_limit("user-1", "wardrobe-write", limit=10, window_seconds=60, cost=8)
        with pytest.raises(HTTPException):
            rate_limit.check_rate_limit("user-1", "wardrobe-write", limit=10, window_seconds=60, cost=3)
        # the rejected attempt must not have partially consumed the remaining 2 units
        rate_limit.check_rate_limit("user-1", "wardrobe-write", limit=10, window_seconds=60, cost=2)

    def test_concurrent_calls_never_overshoot_the_limit(self):
        """Sanity check under real thread contention: the atomic Lua script (one EVAL
        round trip) never overshoots `limit`, unlike a plain prune/count/read pipeline
        followed by a *separate* ZADD pipeline, which lets N concurrent callers all
        observe "under limit" before any of them writes.

        Caveat: fakeredis has no network latency, so this alone can't reproduce that
        race even against the old two-pipeline implementation -- verified manually by
        injecting a delay between the two pipelines (30/30 succeeded against limit=5,
        vs. exactly 5/30 for the atomic version below). The atomicity guarantee here is
        structural (a single EVAL is one round trip, executed atomically server-side by
        Redis), not something this timing-insensitive test can prove on its own."""
        limit = 5
        attempts = 30

        def _try_once(_):
            try:
                rate_limit.check_rate_limit("racer", "chat", limit=limit, window_seconds=60)
                return True
            except HTTPException:
                return False

        with ThreadPoolExecutor(max_workers=attempts) as pool:
            results = list(pool.map(_try_once, range(attempts)))

        assert sum(results) == limit
