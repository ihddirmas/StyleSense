"""
Unit tests for today_service: eliminating a closet down to outfit survivors.

Pure unit tests -- no network, no Supabase, no Anthropic credits.
Run with: .\\venv\\Scripts\\python.exe -m pytest tests/test_today_service_unit.py -v
"""
import asyncio
import os
import sys
from pathlib import Path

# color_service imports the Anthropic client at load; nothing here calls it.
os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services import aria_tools, today_service, weather_service

PROFILE = {"season": "autumn", "contrast": "medium", "body_type": "inverted_triangle"}
SKIN = {"colors": {"skin_color": "#C68E6A"}}


def _item(item_id, name, category, color, tags=None):
    return {"id": item_id, "name": name, "category": category, "color": color, "tags": tags or [], "image_url": f"https://x/{item_id}.jpg"}


CLOSET = [
    _item("deepv", "Black deep-V top", "tops", "black"),
    _item("rust", "Rust V-neck blouse", "tops", "rust"),
    _item("washed", "Olive crew tee", "tops", "olive", ["status:laundry"]),
    _item("wide", "Cream wide-leg trousers", "bottoms", "cream"),
    _item("jeans", "Blue jeans", "bottoms", "denim"),
    _item("heels", "Black stilettos", "shoes", "black"),
    _item("loafers", "Tan loafers", "shoes", "tan"),
    _item("coat", "Deep teal wool coat", "outerwear", "deep teal"),
]


def _office_party_in_the_rain(wardrobe=None, **overrides):
    args = dict(
        color_profile=PROFILE, skin_analysis=SKIN, occasion="office_party",
        temp_c=9, raining=True, walk_minutes=25, transport="transit",
    )
    return today_service.eliminate(CLOSET if wardrobe is None else wardrobe, **{**args, **overrides})


def _stage(result, check):
    return next(s for s in result["stages"] if s["check"] == check)


def _survivor_ids(result):
    return [{i["id"] for i in s["items"]} for s in result["survivors"]]


def test_counts_add_up_from_total_combos_to_survivors():
    result = _office_party_in_the_rain()

    assert result["checked_combos"] == result["total_combos"] > 0
    assert result["survivor_count"] == result["checked_combos"] - sum(s["cut"] for s in result["stages"])
    for before, after in zip(result["stages"], result["stages"][1:]):
        assert after["before"] == before["before"] - before["cut"]


def test_laundry_item_is_cut_and_named_as_the_reason():
    result = _office_party_in_the_rain()

    availability = _stage(result, "availability")
    assert availability["cut"] > 0
    assert any("Olive crew tee" in reason for reason in availability["reasons"])
    assert not any("washed" in ids for ids in _survivor_ids(result))


def test_your_office_party_rules_cut_the_deep_v_and_the_stilettos():
    result = _office_party_in_the_rain()

    assert _stage(result, "occasion")["cut"] > 0
    assert _stage(result, "footwear")["cut"] > 0
    for ids in _survivor_ids(result):
        assert "deepv" not in ids and "heels" not in ids


def test_survivor_includes_shoes_and_the_coat_the_weather_needs():
    result = _office_party_in_the_rain()

    assert result["survivors"]
    best = {i["id"] for i in result["survivors"][0]["items"]}
    assert "rust" in best and "loafers" in best and "coat" in best


def test_at_most_three_survivors_and_they_vary_the_main_piece_when_possible():
    closet = CLOSET + [
        _item("rust2", "Rust crew sweater", "tops", "rust"),
        _item("rust3", "Rust polo shirt", "tops", "rust"),
    ]
    result = _office_party_in_the_rain(closet)

    assert len(result["survivors"]) == 3
    tops = [next(i["id"] for i in s["items"] if i["category"] == "tops") for s in result["survivors"]]
    assert len(set(tops)) == 3


def test_soft_stage_never_empties_the_closet_it_keeps_outfits_with_a_warning():
    closet = [_item("t", "Black crew tee", "tops", "black"), _item("b", "Black jeans", "bottoms", "black")]
    result = today_service.eliminate(closet, color_profile=PROFILE, occasion="casual", temp_c=22, raining=False)

    assert result["survivor_count"] == 1
    assert _stage(result, "color_on_you")["cut"] == 0
    assert _stage(result, "color_on_you")["kept_with_warning"] == 1
    assert result["survivors"][0]["warnings"]


def test_hard_stage_can_empty_the_closet_and_says_so():
    closet = [
        _item("t", "Olive crew tee", "tops", "olive", ["status:laundry"]),
        _item("b", "Blue jeans", "bottoms", "denim"),
    ]
    result = today_service.eliminate(closet, color_profile=PROFILE)

    assert result["survivors"] == []
    assert result["survivor_count"] == 0
    assert "laundry" in " ".join(_stage(result, "availability")["reasons"])


def test_missing_context_is_reported_not_guessed():
    result = today_service.eliminate(CLOSET, color_profile=PROFILE, skin_analysis=SKIN)

    assert _stage(result, "occasion")["status"] == "no_data"
    assert _stage(result, "weather")["status"] == "no_data"
    assert {"occasion", "weather"} <= set(result["missing_context"])


def test_closet_without_a_full_outfit_returns_zero_combos():
    result = today_service.eliminate([_item("s", "Tan loafers", "shoes", "tan")])

    assert result["total_combos"] == 0
    assert result["survivors"] == []
    assert result["stages"] == []


def test_huge_closet_is_capped_and_reports_how_many_were_checked():
    closet = (
        [_item(f"t{i}", f"Crew tee {i}", "tops", "olive") for i in range(30)]
        + [_item(f"b{i}", f"Jeans {i}", "bottoms", "denim") for i in range(30)]
        + [_item(f"s{i}", f"Loafers {i}", "shoes", "tan") for i in range(10)]
    )
    result = today_service.eliminate(closet, color_profile=PROFILE)

    assert result["total_combos"] == 9000
    assert result["checked_combos"] == today_service.MAX_COMBOS


# -- Aria tool wiring --

def test_tool_is_declared_readonly():
    assert "what_can_i_wear_today" in aria_tools.READONLY_TOOLS
    assert "what_can_i_wear_today" in {t["name"] for t in aria_tools.ANTHROPIC_TOOLS}


def test_tool_validation_clamps_and_drops_bad_context():
    validated = aria_tools.validate_tool_input(
        "what_can_i_wear_today",
        {"occasion": "not-real", "walk_minutes": 999, "transport": "teleport", "raining": "yes", "city": "  Pune "},
        CLOSET,
    )

    assert validated == {
        "occasion": None, "temp_c": None, "raining": None,
        "walk_minutes": 180, "transport": None, "city": "Pune",
    }


def test_tool_runs_with_stated_weather_without_any_lookup(monkeypatch):
    async def fail_lookup(city):
        raise AssertionError("must not look up weather the user already gave")

    monkeypatch.setattr(weather_service, "get_weather_for_city", fail_lookup)
    tool_input = aria_tools.validate_tool_input(
        "what_can_i_wear_today",
        {"occasion": "office_party", "temp_c": 9, "raining": True, "walk_minutes": 25, "transport": "transit", "city": "Pune"},
        CLOSET,
    )
    result = asyncio.run(aria_tools.execute_readonly_tool(
        "what_can_i_wear_today", tool_input,
        {"wardrobe": CLOSET, "color_profile": PROFILE, "skin_analysis": SKIN},
    ))

    assert result["survivor_count"] > 0
    assert result["context"]["weather_source"] == "user"


def test_tool_uses_live_weather_for_a_city_and_labels_the_source(monkeypatch):
    async def lookup(city):
        return {"temp_c": 9.0, "raining": True, "source": "open-meteo", "place": city}

    monkeypatch.setattr(weather_service, "get_weather_for_city", lookup)
    result = asyncio.run(aria_tools.execute_readonly_tool(
        "what_can_i_wear_today",
        {"occasion": "office_party", "temp_c": None, "raining": None, "walk_minutes": 25, "transport": "transit", "city": "Pune"},
        {"wardrobe": CLOSET, "color_profile": PROFILE, "skin_analysis": SKIN},
    ))

    assert result["context"]["temp_c"] == 9.0
    assert result["context"]["raining"] is True
    assert result["context"]["weather_source"] == "open-meteo"
    assert result["context"]["place"] == "Pune"


def test_tool_survives_a_failed_weather_lookup(monkeypatch):
    async def lookup(city):
        return None

    monkeypatch.setattr(weather_service, "get_weather_for_city", lookup)
    result = asyncio.run(aria_tools.execute_readonly_tool(
        "what_can_i_wear_today",
        {"occasion": "casual", "temp_c": None, "raining": None, "walk_minutes": None, "transport": None, "city": "Nowhere"},
        {"wardrobe": CLOSET, "color_profile": PROFILE},
    ))

    assert "weather" in result["missing_context"]
