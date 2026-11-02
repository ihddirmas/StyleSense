"""
Unit tests: multi-item try-on runs on YouCam by default, layered garment by garment,
with no silent fallback to another provider.

No network: YouCam, storage and analytics are faked. Dummy settings are set before
import because anthropic_service, db and supabase_service read them at module load.
Run with: .\\venv\\Scripts\\python.exe -m pytest tests/test_tryon_youcam_unit.py -v
"""
import asyncio
import os
import sys
from pathlib import Path

import pytest

os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")
os.environ.setdefault("DATABASE_URL", "postgresql://user:pass@localhost:5432/unused")
os.environ.setdefault("SUPABASE_URL", "https://unused.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "unused")
os.environ.setdefault("RUNWAY_API_KEY", "unused")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from models.schemas import MultiItemTryOnRequest, TryOnRequest
from services import runway_service, tryon_service, youcam_service

TOP = {"id": "t", "image_url": "https://x/top.jpg", "name": "Rust blouse", "category": "tops"}
BOTTOM = {"id": "b", "image_url": "https://x/trousers.jpg", "name": "Cream trousers", "category": "bottoms"}
COAT = {"id": "c", "image_url": "https://x/coat.jpg", "name": "Teal coat", "category": "outerwear"}
DRESS = {"id": "d", "image_url": "https://x/dress.jpg", "name": "Rust dress", "category": "dresses"}
SHOES = {"id": "s", "image_url": "https://x/shoes.jpg", "name": "Tan loafers", "category": "shoes"}


@pytest.fixture
def fakes(monkeypatch):
    """Record YouCam calls and stub everything that touches the outside world."""
    calls, saved = [], []

    def fake_youcam(user_image_url, garment_image_url, garment_category):
        calls.append((user_image_url, garment_image_url, garment_category))
        return {"image_url": f"https://youcam/render-{len(calls)}.jpg", "task_id": f"task-{len(calls)}", "provider": "youcam"}

    async def fake_rehost(user_id, url):
        return f"https://storage/{url.rsplit('/', 1)[-1]}"

    async def fake_archive(*args, **kwargs):
        return {}

    def fake_save(**kwargs):
        saved.append(kwargs)
        return {"id": "result-1"}

    def runway_must_not_run(*args, **kwargs):
        raise AssertionError("Runway must not run for a YouCam try-on")

    monkeypatch.setattr(youcam_service, "youcam_apparel_tryon", fake_youcam)
    monkeypatch.setattr(tryon_service, "rehost", fake_rehost)
    monkeypatch.setattr(tryon_service, "archive_tryon_image_to_b2", fake_archive)
    monkeypatch.setattr(tryon_service.supabase_service, "save_tryon_result", fake_save)
    monkeypatch.setattr(tryon_service.analytics_service, "capture", lambda *a, **k: None)
    monkeypatch.setattr(tryon_service.usage_limits, "check_tryon_cap", lambda *a, **k: None)
    monkeypatch.setattr(tryon_service, "check_cooldown", lambda *a, **k: None)
    monkeypatch.setattr(runway_service, "runway_generate_multi_tryon", runway_must_not_run)
    monkeypatch.setattr(tryon_service.supabase_service, "get_user", lambda user_id: {})
    return {"calls": calls, "saved": saved}


def _run(items, **kwargs):
    return asyncio.run(tryon_service.run_multi_tryon("user-1", "https://x/me.jpg", items, **kwargs))


def test_youcam_is_the_default_try_on_engine(fakes):
    result = _run([TOP])

    assert result["model_used"] == "youcam"
    assert len(fakes["calls"]) == 1


def test_request_schemas_default_to_youcam():
    single = TryOnRequest(item_image_url="https://x/i.jpg", avatar_selfie_url="https://x/me.jpg", item_name="Top")
    multi = MultiItemTryOnRequest(avatar_selfie_url="https://x/me.jpg", items=[TOP])

    assert single.model == "youcam"
    assert multi.model == "youcam"


def test_outfit_layers_bottom_then_top_then_coat_each_on_the_previous_render(fakes):
    result = _run([COAT, TOP, BOTTOM])

    assert fakes["calls"] == [
        ("https://x/me.jpg", "https://x/trousers.jpg", "lower_body"),
        ("https://youcam/render-1.jpg", "https://x/top.jpg", "upper_body"),
        ("https://youcam/render-2.jpg", "https://x/coat.jpg", "upper_body"),
    ]
    assert result["result_image_url"] == "https://storage/render-3.jpg"
    assert fakes["saved"][0]["model_used"] == "youcam"


def test_youcam_prefers_the_full_body_photo_over_a_face_selfie(fakes, monkeypatch):
    monkeypatch.setattr(tryon_service.supabase_service, "get_user", lambda user_id: {"full_body_url": "https://x/body.jpg"})

    _run([TOP])

    assert fakes["calls"][0][0] == "https://x/body.jpg"


def test_dress_renders_as_full_body(fakes):
    _run([DRESS])

    assert fakes["calls"][0][2] == "full_body"


def test_shoes_are_reported_as_not_rendered_instead_of_silently_dropped(fakes):
    result = _run([TOP, SHOES])

    assert len(fakes["calls"]) == 1
    assert result["not_rendered"] == ["Tan loafers"]


def test_outfit_with_nothing_renderable_is_a_clear_error(fakes):
    with pytest.raises(Exception) as err:
        _run([SHOES])

    assert "top, bottom, dress or outerwear" in str(getattr(err.value, "detail", err.value))
    assert fakes["calls"] == []


def test_youcam_failure_surfaces_and_never_falls_back_to_runway(fakes, monkeypatch):
    def broken(**kwargs):
        raise RuntimeError("error_src_face_too_small")

    monkeypatch.setattr(youcam_service, "youcam_apparel_tryon", broken)

    with pytest.raises(RuntimeError, match="error_src_face_too_small"):
        _run([TOP])
    assert fakes["saved"] == []


def test_runway_still_runs_when_explicitly_chosen(fakes, monkeypatch):
    called = []

    def fake_runway(**kwargs):
        called.append(kwargs["model"])
        return {"image_url": "https://runway/r.jpg", "model_used": kwargs["model"], "prompt_used": "p", "task_id": "r1"}

    async def no_restore(url, *args, **kwargs):
        return url

    monkeypatch.setattr(runway_service, "runway_generate_multi_tryon", fake_runway)
    monkeypatch.setattr(tryon_service, "maybe_restore_face", no_restore)
    monkeypatch.setattr(tryon_service, "extra_selfies", lambda *a, **k: [])
    monkeypatch.setattr(tryon_service, "ensure_runway_ratio", lambda user_id, url: url)

    result = _run([TOP], model="gen4_image", enhance_prompt=False)

    assert called == ["gen4_image"]
    assert result["model_used"] == "gen4_image"
    assert fakes["calls"] == []
