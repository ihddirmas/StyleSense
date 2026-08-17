"""
Unit tests for the color/Kibbe background-analysis status tracking added in
supabase_schema_v2o_analysis_status.sql.

Both analyses run in FastAPI BackgroundTasks and swallow their exceptions, so
before these status columns a failure was completely invisible -- the Style
Report page said "hasn't finished yet" forever. These tests pin the state
machine, especially the case a naive `except: status="failed"` would get
wrong: analytics fires AFTER the profile write, so a PostHog blip must not
stamp "failed" over an analysis that already succeeded.

Pure unit tests -- every collaborator is monkeypatched. No network, no
Supabase, no Anthropic credits.
Run with: .\\venv\\Scripts\\python.exe -m pytest tests/test_analysis_status_unit.py -v
"""
import asyncio
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from routers import avatar as avatar_router


class _UpsertRecorder:
    """Captures every upsert_user(**fields) call so tests can assert on the
    final status and on ordering."""

    def __init__(self):
        self.calls: list[dict] = []

    def __call__(self, user_id: str, **fields):
        self.calls.append(fields)
        return {}

    def statuses(self, column: str) -> list[str]:
        return [c[column] for c in self.calls if column in c]

    def final_status(self, column: str) -> str | None:
        seen = self.statuses(column)
        return seen[-1] if seen else None


@pytest.fixture
def rec(monkeypatch):
    recorder = _UpsertRecorder()
    monkeypatch.setattr(avatar_router.supabase_service, "upsert_user", recorder)
    monkeypatch.setattr(avatar_router.supabase_service, "get_user", lambda _uid: {})
    # Neutralise the optional side-quests so each test drives one variable.
    import services.youcam_service as youcam
    monkeypatch.setattr(youcam, "youcam_photo_lighting", lambda _url: None)
    return recorder


def _run(coro):
    return asyncio.run(coro)


# --- color analysis ---------------------------------------------------------


def test_color_success_ends_ready(rec, monkeypatch):
    monkeypatch.setattr(
        avatar_router.color_service, "analyze_color_profile",
        lambda _src: {"season": "autumn", "confidence": 0.8},
    )
    _run(avatar_router._bg_refresh_profile("u1", "https://x/a.jpg"))

    assert rec.statuses("color_analysis_status")[0] == "generating"
    assert rec.final_status("color_analysis_status") == "ready"


def test_color_exception_ends_failed(rec, monkeypatch):
    def boom(_src):
        raise RuntimeError("vision API down")

    monkeypatch.setattr(avatar_router.color_service, "analyze_color_profile", boom)
    _run(avatar_router._bg_refresh_profile("u1", "https://x/a.jpg"))

    assert rec.final_status("color_analysis_status") == "failed"


def test_color_empty_result_ends_failed(rec, monkeypatch):
    """A vision call returning nothing usable is a failure the user should see,
    not a silent no-op that leaves the page waiting forever."""
    monkeypatch.setattr(avatar_router.color_service, "analyze_color_profile", lambda _src: None)
    _run(avatar_router._bg_refresh_profile("u1", "https://x/a.jpg"))

    assert rec.final_status("color_analysis_status") == "failed"


def test_analytics_failure_does_not_clobber_ready(rec, monkeypatch):
    """Regression guard: analytics runs after the profile write, so an
    exception there must NOT downgrade a successful analysis to failed."""
    monkeypatch.setattr(
        avatar_router.color_service, "analyze_color_profile",
        lambda _src: {"season": "winter", "confidence": 0.9},
    )
    import services.analytics_service as analytics

    def boom(*_a, **_kw):
        raise RuntimeError("posthog unreachable")

    monkeypatch.setattr(analytics, "capture", boom)
    _run(avatar_router._bg_refresh_profile("u1", "https://x/a.jpg"))

    assert rec.final_status("color_analysis_status") == "ready"
    assert "failed" not in rec.statuses("color_analysis_status")


def test_status_write_failure_never_raises(rec, monkeypatch):
    """Status bookkeeping is best-effort -- a DB blip on the flag must not take
    down the fire-and-forget task."""
    def boom(_uid, **_fields):
        raise RuntimeError("db unreachable")

    monkeypatch.setattr(avatar_router.supabase_service, "upsert_user", boom)
    monkeypatch.setattr(avatar_router.color_service, "analyze_color_profile", lambda _src: None)

    _run(avatar_router._bg_refresh_profile("u1", "https://x/a.jpg"))  # must not raise


# --- kibbe analysis --------------------------------------------------------


def _patch_kibbe(monkeypatch, result):
    import services.kibbe_service as kibbe

    if isinstance(result, Exception):
        def impl(_url):
            raise result
    else:
        def impl(_url):
            return result

    monkeypatch.setattr(kibbe, "analyze_kibbe_type", impl)


def test_kibbe_success_ends_ready(rec, monkeypatch):
    _patch_kibbe(monkeypatch, {"kibbe_type": "soft_autumn", "confidence": 0.7})
    _run(avatar_router._bg_refresh_kibbe("u1", "https://x/body.jpg"))

    assert rec.statuses("kibbe_analysis_status")[0] == "generating"
    assert rec.final_status("kibbe_analysis_status") == "ready"


def test_kibbe_exception_ends_failed(rec, monkeypatch):
    _patch_kibbe(monkeypatch, RuntimeError("kibbe vision failed"))
    _run(avatar_router._bg_refresh_kibbe("u1", "https://x/body.jpg"))

    assert rec.final_status("kibbe_analysis_status") == "failed"


def test_kibbe_empty_result_ends_failed(rec, monkeypatch):
    _patch_kibbe(monkeypatch, None)
    _run(avatar_router._bg_refresh_kibbe("u1", "https://x/body.jpg"))

    assert rec.final_status("kibbe_analysis_status") == "failed"


def test_color_and_kibbe_statuses_are_independent(rec, monkeypatch):
    """A failed Kibbe pass must not touch the color status (they are queued as
    two separate BackgroundTasks off the same upload)."""
    monkeypatch.setattr(
        avatar_router.color_service, "analyze_color_profile",
        lambda _src: {"season": "spring", "confidence": 0.6},
    )
    _patch_kibbe(monkeypatch, RuntimeError("nope"))

    _run(avatar_router._bg_refresh_profile("u1", "https://x/a.jpg"))
    _run(avatar_router._bg_refresh_kibbe("u1", "https://x/body.jpg"))

    assert rec.final_status("color_analysis_status") == "ready"
    assert rec.final_status("kibbe_analysis_status") == "failed"
