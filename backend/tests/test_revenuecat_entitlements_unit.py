"""Unit tests for RevenueCat plan → try-on cap mapping (no network)."""
from services import revenuecat_service, usage_limits


def test_tryon_limit_free_without_secret(monkeypatch):
    monkeypatch.setattr(revenuecat_service, "REVENUECAT_SECRET_API_KEY", "")
    revenuecat_service.invalidate("u-free")
    assert revenuecat_service.get_plan("u-free") == "free"
    assert usage_limits.tryon_limit("u-free") == usage_limits.FREE_TRYON_MONTHLY_LIMIT


def test_tryon_limit_studio(monkeypatch):
    monkeypatch.setattr(revenuecat_service, "get_plan", lambda _uid: "studio")
    assert usage_limits.tryon_limit("u-studio") == revenuecat_service.STUDIO_TRYON_LIMIT


def test_tryon_limit_pro(monkeypatch):
    monkeypatch.setattr(revenuecat_service, "get_plan", lambda _uid: "pro")
    assert usage_limits.tryon_limit("u-pro") == revenuecat_service.PRO_TRYON_LIMIT


def test_tryon_capped_respects_plan(monkeypatch):
    monkeypatch.setattr(usage_limits, "UNLIMITED_TESTER_USER_IDS", set())
    monkeypatch.setattr(usage_limits, "tryon_limit", lambda _uid: 40)
    monkeypatch.setattr(
        usage_limits.supabase_service, "count_tryons_this_month", lambda _uid: 40
    )
    assert usage_limits.tryon_capped("u1") is True
    monkeypatch.setattr(
        usage_limits.supabase_service, "count_tryons_this_month", lambda _uid: 39
    )
    assert usage_limits.tryon_capped("u1") is False
