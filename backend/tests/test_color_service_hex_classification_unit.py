"""
Unit tests for color_service.classify_season_from_hex -- the deterministic
YouCam-Skin-AI-measured classification that grounds color_profile in a real
hex swatch instead of only Claude's visual guess.

Pure unit tests -- no network, no Supabase, no Anthropic credits.
Run with: .\\venv\\Scripts\\python.exe -m pytest tests/test_color_service_hex_classification_unit.py -v
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from services.color_service import classify_season_from_hex


def test_warm_light_hex_classifies_as_spring():
    # High red-minus-blue (golden) + light -> warm/spring
    result = classify_season_from_hex("#E8C39E")
    assert result["undertone"] == "warm"
    assert result["season"] == "spring"


def test_warm_deep_hex_classifies_as_autumn():
    result = classify_season_from_hex("#8B5A2B")
    assert result["undertone"] == "warm"
    assert result["season"] == "autumn"


def test_cool_light_hex_classifies_as_summer():
    # Blue channel at or above red (r - b < 0.04) + light -> cool/summer
    result = classify_season_from_hex("#D2D2D7")
    assert result["undertone"] == "cool"
    assert result["season"] == "summer"


def test_cool_deep_hex_classifies_as_winter():
    result = classify_season_from_hex("#5A5A64")
    assert result["undertone"] == "cool"
    assert result["season"] == "winter"


def test_result_includes_flattering_and_avoid_colors():
    result = classify_season_from_hex("#E8C39E")
    assert len(result["flattering_colors"]) > 0
    assert len(result["avoid_colors"]) > 0
    # avoid_colors should come from the opposite season's palette, never the
    # same season's own flattering picks
    assert not set(result["flattering_colors"]) & set(result["avoid_colors"])


def test_result_is_tagged_as_youcam_measured():
    result = classify_season_from_hex("#E8C39E")
    assert result["source"] == "youcam_measured"


def test_missing_hex_returns_none():
    assert classify_season_from_hex(None) is None
    assert classify_season_from_hex("") is None


def test_malformed_hex_returns_none():
    assert classify_season_from_hex("not-a-color") is None
    assert classify_season_from_hex("#12345") is None  # too short


def test_hex_without_hash_prefix_still_parses():
    result = classify_season_from_hex("E8C39E")
    assert result is not None
    assert result["undertone"] in ("warm", "cool", "neutral")
