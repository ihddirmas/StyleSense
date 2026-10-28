"""
Unit tests for look_check_service -- the "should I wear this today?" check
(weather, availability, color vs skin/season, harmony, shape, occasion,
footwear) and the Aria check_outfit tool wiring.

Pure unit tests -- no network, no Supabase, no Runway/Anthropic credits.
Run with: .\\venv\\Scripts\\python.exe -m pytest tests/test_look_check_service_unit.py -v
"""
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# color_service builds an Anthropic client at import; no call is ever made here.
os.environ.setdefault("ANTHROPIC_API_KEY", "test-key-unused")

from services import aria_tools
from services.look_check_service import (
    check_outfit,
    delta_e_2000,
    hex_to_lab,
    is_wearable,
    item_status,
    resolve_hex,
)
from services.outfit_combo_service import generate_candidate_combos

AUTUMN_INV_TRIANGLE = {"season": "autumn", "contrast": "medium", "body_type": "inverted_triangle"}


def _check(result, key):
    return next(c for c in result["checks"] if c["check"] == key)


# ── color math ──

def test_ciede2000_matches_sharma_reference_pair():
    # Pair 1 from Sharma, Wu & Dalal (2005) CIEDE2000 test data.
    assert round(delta_e_2000((50, 2.6772, -79.7751), (50, 0, -82.7485)), 4) == 2.0425


def test_identical_colors_have_zero_delta_e():
    lab = hex_to_lab("#B7410E")
    assert delta_e_2000(lab, lab) == 0


def test_resolve_hex_accepts_hex_names_and_free_text():
    assert resolve_hex("#b7410e") == "#b7410e"
    assert resolve_hex("Rust") == resolve_hex("rust")
    assert resolve_hex("dark navy cotton") == resolve_hex("navy")
    assert resolve_hex("light blue") != resolve_hex("blue")
    assert resolve_hex("iridescent") is None
    assert resolve_hex(None) is None


# ── color on you ──

def test_in_palette_color_passes_with_numbers():
    r = check_outfit([{"id": "1", "name": "Rust knit", "category": "tops", "color": "rust"}],
                     color_profile=AUTUMN_INV_TRIANGLE)
    check = _check(r, "color_on_you")
    assert check["status"] == "pass"
    assert "dE 0.0" in check["findings"][0]["reason"]


def test_black_top_fails_for_autumn_because_it_reads_winter():
    r = check_outfit([{"id": "1", "name": "Black tee", "category": "tops", "color": "black"}],
                     color_profile=AUTUMN_INV_TRIANGLE)
    finding = _check(r, "color_on_you")["findings"][0]
    assert finding["status"] == "fail"
    assert "winter" in finding["reason"]


def test_off_palette_bottom_is_only_a_warning_away_from_the_face():
    r = check_outfit([{"id": "1", "name": "Black jeans", "category": "bottoms", "color": "black"}],
                     color_profile=AUTUMN_INV_TRIANGLE)
    assert _check(r, "color_on_you")["status"] == "warn"


def test_top_close_to_measured_skin_warns_washout():
    r = check_outfit(
        [{"id": "1", "name": "Nude top", "category": "tops", "color": "#C8A080"}],
        color_profile={"season": "autumn"},
        skin_analysis={"colors": {"skin_color": "#C89F7F"}},
    )
    assert r["measured_skin"] is True
    assert any("wash you out" in f["reason"] for f in _check(r, "color_on_you")["findings"])


def test_color_on_you_unknown_without_profile():
    r = check_outfit([{"id": "1", "name": "Rust knit", "category": "tops", "color": "rust"}])
    assert _check(r, "color_on_you")["status"] == "unknown"


# ── colors together ──

def test_complementary_pair_passes():
    r = check_outfit([{"name": "t", "category": "tops", "color": "blue"},
                      {"name": "b", "category": "bottoms", "color": "orange"}])
    check = _check(r, "color_together")
    assert check["status"] == "pass"
    assert "complementary" in check["findings"][0]["reason"]


def test_neutral_anchor_passes():
    r = check_outfit([{"name": "t", "category": "tops", "color": "mustard"},
                      {"name": "b", "category": "bottoms", "color": "navy"}])
    assert _check(r, "color_together")["status"] == "pass"


def test_near_miss_match_warns():
    r = check_outfit([{"name": "t", "category": "tops", "color": "#2F5DA8"},
                      {"name": "b", "category": "bottoms", "color": "#3A6AB8"}])
    assert "missed match" in _check(r, "color_together")["findings"][0]["reason"]


def test_clashing_hues_warn():
    r = check_outfit([{"name": "t", "category": "tops", "color": "yellow"},
                      {"name": "b", "category": "bottoms", "color": "pink"}])
    assert _check(r, "color_together")["status"] == "warn"


# ── availability ──

def test_status_read_from_field_or_tag():
    assert item_status({"status": "laundry"}) == "laundry"
    assert item_status({"tags": ["multi-item-detected", "status:needs-iron"]}) == "needs_iron"
    assert item_status({"tags": ["status:unknown-thing"]}) is None


def test_laundry_item_fails_and_ironing_only_warns():
    r = check_outfit([
        {"id": "1", "name": "Jeans", "category": "bottoms", "tags": ["status:laundry"]},
        {"id": "2", "name": "Shirt", "category": "tops", "tags": ["status:needs_iron"]},
    ])
    findings = _check(r, "availability")["findings"]
    assert {f["item_id"]: f["status"] for f in findings} == {"1": "fail", "2": "warn"}
    assert r["verdict"] == "skip"


def test_combo_generator_skips_laundry_items():
    items = [
        {"id": "t1", "name": "Clean tee", "category": "tops", "color": "rust"},
        {"id": "t2", "name": "Dirty tee", "category": "tops", "color": "rust", "tags": ["status:laundry"]},
        {"id": "b1", "name": "Jeans", "category": "bottoms", "color": "denim"},
    ]
    assert not is_wearable(items[1])
    ids = {it["id"] for combo in generate_candidate_combos(items, AUTUMN_INV_TRIANGLE) for it in combo["items"]}
    assert "t2" not in ids and "t1" in ids


# ── shape ──

def test_inverted_triangle_shoulder_volume_warns_and_wide_leg_passes():
    r = check_outfit([
        {"id": "1", "name": "Puff sleeve blouse", "category": "tops", "color": "cream"},
        {"id": "2", "name": "Wide-leg trousers", "category": "bottoms", "color": "olive"},
    ], color_profile=AUTUMN_INV_TRIANGLE)
    by_item = {f["item_id"]: f["status"] for f in _check(r, "shape")["findings"]}
    assert by_item == {"1": "warn", "2": "pass"}


# ── occasion ──

def test_deep_neckline_fails_at_office_party():
    r = check_outfit([{"id": "1", "name": "Deep V-neck satin top", "category": "tops"}], occasion="office_party")
    assert _check(r, "occasion")["status"] == "fail"
    assert r["verdict"] == "skip"


def test_deep_neckline_fine_for_a_date():
    r = check_outfit([{"id": "1", "name": "Deep V-neck satin top", "category": "tops"}], occasion="date")
    assert _check(r, "occasion")["status"] == "pass"


def test_white_dress_fails_for_wedding_guest():
    r = check_outfit([{"id": "1", "name": "Midi dress", "category": "dresses", "color": "white"}],
                     occasion="wedding_guest")
    assert _check(r, "occasion")["status"] == "fail"


def test_unknown_occasion_is_ignored_not_guessed():
    r = check_outfit([{"name": "Tee", "category": "tops"}], occasion="space-gala")
    assert _check(r, "occasion")["status"] == "unknown"


# ── footwear & weather ──

def test_stilettos_fail_on_a_long_walk_but_block_heels_only_warn():
    stiletto = check_outfit([{"id": "s", "name": "Stiletto pumps", "category": "shoes"}], walk_minutes=25)
    block = check_outfit([{"id": "s", "name": "Block heel sandals", "category": "shoes"}], walk_minutes=12)
    assert _check(stiletto, "footwear")["status"] == "fail"
    assert _check(block, "footwear")["status"] == "warn"


def test_heels_fine_for_a_car_door_to_door():
    r = check_outfit([{"id": "s", "name": "Stiletto pumps", "category": "shoes"}], walk_minutes=2, transport="car")
    assert _check(r, "footwear")["status"] == "pass"


def test_cold_rain_without_outerwear_warns():
    r = check_outfit([{"name": "Tank top", "category": "tops"}, {"name": "Suede loafers", "category": "shoes"}],
                     temp_c=8, raining=True)
    reasons = " ".join(f["reason"] for f in _check(r, "weather")["findings"])
    assert "jacket" in reasons and "suede" in reasons and "tank" in reasons


def test_wool_in_heat_warns():
    r = check_outfit([{"name": "Wool sweater", "category": "tops"}], temp_c=31)
    assert _check(r, "weather")["status"] == "warn"


def test_keyword_match_does_not_hit_inside_other_words():
    # "tan" must not match "tank", "pump" must not match "pumpkin".
    r = check_outfit([{"name": "Pumpkin knit", "category": "shoes"}], walk_minutes=30)
    assert _check(r, "footwear")["status"] == "pass"


# ── overall ──

def test_all_clear_outfit_is_wear_with_full_confidence():
    r = check_outfit(
        [
            {"id": "1", "name": "Rust V-neck knit", "category": "tops", "color": "rust"},
            {"id": "2", "name": "Cream wide-leg trousers", "category": "bottoms", "color": "cream"},
            {"id": "3", "name": "Leather loafers", "category": "shoes", "color": "brown"},
        ],
        color_profile=AUTUMN_INV_TRIANGLE,
        occasion="office",
        temp_c=18,
        raining=False,
        walk_minutes=10,
        transport="transit",
    )
    assert r["verdict"] == "wear", r
    assert r["confidence"] == 1.0
    assert r["unknowns"] == []


def test_missing_context_lowers_confidence_and_lists_unknowns():
    r = check_outfit([{"name": "Tee", "category": "tops"}])
    assert r["confidence"] < 0.5
    assert "Weather" in r["unknowns"] and "Occasion" in r["unknowns"]


# ── Aria tool wiring ──

WARDROBE = [
    {"id": "t1", "name": "Black deep V top", "category": "tops", "color": "black"},
    {"id": "b1", "name": "Olive wide-leg trousers", "category": "bottoms", "color": "olive"},
]


def test_check_outfit_is_a_readonly_tool():
    assert "check_outfit" in aria_tools.READONLY_TOOLS
    assert any(t["name"] == "check_outfit" for t in aria_tools.ANTHROPIC_TOOLS)


def test_validator_drops_foreign_ids_and_clamps_context():
    v = aria_tools.validate_tool_input(
        "check_outfit",
        {"item_ids": ["t1", "not-mine"], "occasion": "office_party", "temp_c": 99,
         "raining": "yes", "walk_minutes": "20", "transport": "teleport"},
        WARDROBE,
    )
    assert v == {"item_ids": ["t1"], "occasion": "office_party", "temp_c": 55.0,
                 "raining": None, "walk_minutes": 20, "transport": None}


def test_validator_rejects_when_no_owned_items():
    assert aria_tools.validate_tool_input("check_outfit", {"item_ids": ["nope"]}, WARDROBE) is None


def test_execute_readonly_check_outfit_uses_context_profiles():
    tool_input = aria_tools.validate_tool_input(
        "check_outfit", {"item_ids": ["t1", "b1"], "occasion": "office_party"}, WARDROBE
    )
    result = asyncio.run(aria_tools.execute_readonly_tool(
        "check_outfit", tool_input, {"wardrobe": WARDROBE, "color_profile": AUTUMN_INV_TRIANGLE},
    ))
    assert result["verdict"] == "skip"
    assert _check(result, "occasion")["status"] == "fail"
    assert _check(result, "color_on_you")["status"] == "fail"
