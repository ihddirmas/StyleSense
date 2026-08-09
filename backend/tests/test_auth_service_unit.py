"""
Unit tests for auth_service.current_user.

Pure unit tests -- the Supabase network call (_verify_token_via_api) and the Aurora
DB call (supabase_service.ensure_user) are mocked at their I/O boundary; no real
network or DB. Run with:
    .\\venv\\Scripts\\python.exe -m pytest tests/test_auth_service_unit.py -v
"""
import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

import pytest
from fastapi import HTTPException

from services import auth_service


def _patch_blocking_verify(monkeypatch, sleep_seconds=0.3, user=None, raises=None):
    def fake_verify(token):
        time.sleep(sleep_seconds)  # simulates the real synchronous network round-trip
        if raises is not None:
            raise raises
        return user or {"id": "user-1", "email": "user1@example.com"}

    monkeypatch.setattr(auth_service, "_verify_token_via_api", fake_verify)
    monkeypatch.setattr("services.supabase_service.ensure_user", lambda *a, **k: None)


def test_current_user_does_not_block_the_event_loop(monkeypatch):
    _patch_blocking_verify(monkeypatch, sleep_seconds=0.3)

    async def _run():
        ticks = {"n": 0}

        async def ticker():
            while True:
                ticks["n"] += 1
                await asyncio.sleep(0.02)

        ticker_task = asyncio.create_task(ticker())
        await auth_service.current_user("Bearer faketoken")
        ticker_task.cancel()
        return ticks["n"]

    ticks = asyncio.run(_run())
    # A blocking (non-offloaded) call starves the ticker for the whole 0.3s window,
    # so it gets essentially one tick. Offloaded to an executor, the loop keeps
    # ticking roughly every 0.02s throughout -- expect well over half of ~15 ticks.
    assert ticks >= 5


def test_returns_the_resolved_user_on_success(monkeypatch):
    _patch_blocking_verify(monkeypatch, sleep_seconds=0, user={"id": "u-42", "email": "u42@example.com"})
    user = asyncio.run(auth_service.current_user("Bearer faketoken"))
    assert user == {"id": "u-42", "email": "u42@example.com"}


def test_raises_401_when_token_verification_fails(monkeypatch):
    _patch_blocking_verify(monkeypatch, sleep_seconds=0, raises=HTTPException(401, "Invalid or expired token"))
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(auth_service.current_user("Bearer faketoken"))
    assert exc_info.value.status_code == 401


def test_raises_401_for_missing_authorization_header():
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(auth_service.current_user(None))
    assert exc_info.value.status_code == 401


def test_raises_401_for_malformed_authorization_header(monkeypatch):
    _patch_blocking_verify(monkeypatch, sleep_seconds=0)
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(auth_service.current_user("NotBearer sometoken"))
    assert exc_info.value.status_code == 401


def test_malformed_header_fails_fast_without_touching_the_executor(monkeypatch):
    # The format check is cheap and I/O-free, same as the missing-header check --
    # it should reject before ever reaching the executor, not after a thread round-trip.
    def fail_if_called(token):
        raise AssertionError("should not reach the executor for a malformed header")

    monkeypatch.setattr(auth_service, "_resolve_current_user_sync", fail_if_called)
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(auth_service.current_user("NotBearer sometoken"))
    assert exc_info.value.status_code == 401
