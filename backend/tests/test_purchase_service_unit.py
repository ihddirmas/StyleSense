"""
Unit tests for purchase_service: buy or skip, judged against the closet you already own.

Pure unit tests -- no network, no Supabase, no Anthropic credits.
Run with: .\\venv\\Scripts\\python.exe -m pytest tests/test_purchase_service_unit.py -v
"""
import asyncio
import os
import sys
from pathlib import Path

os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services import aria_tools, purchase_service

AUTUMN = {"season": "autumn", "body_type": "inverted_triangle"}
SKIN = {"colors": {"skin_color": "#C68E6A"}}


def _item(item_id, name, category, color, tags=None):
    return {"id": item_id, "name": name, "category": category, "color": color, "tags": tags or []}


CLOSET = [
    _item("b1", "Cream wide-leg trousers", "bottoms", "cream"),
    _item("b2", "Blue jeans", "bottoms", "denim"),
    _item("b3", "Black trousers", "bottoms", "black"),
    _item("t1", "Black crew tee", "tops", "black"),
    _item("s1", "Tan loafers", "shoes", "tan"),
]


def _evaluate(name, category, color, closet=None, profile=AUTUMN, skin=SKIN):
    return purchase_service.evaluate(
        {"name": name, "category": category, "color": color},
        CLOSET if closet is None else closet,
        color_profile=profile,
        skin_analysis=skin,
    )


def test_flattering_piece_that_pairs_with_your_closet_is_a_buy():
    result = _evaluate("Rust crew blouse", "tops", "rust")

    assert result["verdict"] == "buy"
    assert result["outfits_with_closet"] == 3
    assert {p["id"] for p in result["pairs_with"]} == {"b1", "b2", "b3"}


def test_color_that_fights_your_palette_is_not_a_buy():
    result = _evaluate("Icy blue crew blouse", "tops", "#BFE3F5")

    assert result["verdict"] == "think"
    assert result["color"]["status"] == "warn"


def test_piece_with_nothing_to_wear_it_with_is_a_skip():
    result = _evaluate("Rust crew blouse", "tops", "rust", closet=[_item("t1", "Black crew tee", "tops", "black")])

    assert result["verdict"] == "skip"
    assert result["outfits_with_closet"] == 0
    assert "nothing" in result["reason"].lower()


def test_near_duplicate_of_something_you_own_is_flagged():
    closet = [*CLOSET, _item("t2", "Rust V-neck blouse", "tops", "rust")]

    result = _evaluate("Rust crew blouse", "tops", "rust", closet=closet)

    assert result["verdict"] == "think"
    assert [s["id"] for s in result["similar_owned"]] == ["t2"]
    assert "Rust V-neck blouse" in result["reason"]


def test_items_in_the_laundry_still_count_as_owned_for_pairing():
    closet = [_item(f"b{i}", f"Jeans {i}", "bottoms", "denim", ["status:laundry"]) for i in range(3)]

    assert _evaluate("Rust crew blouse", "tops", "rust", closet=closet)["outfits_with_closet"] == 3


def test_dress_counts_as_an_outfit_on_its_own():
    result = _evaluate("Rust dress", "dresses", "rust", closet=[])

    assert result["outfits_with_closet"] == 1
    assert result["verdict"] == "buy"


def test_unknown_color_says_so_instead_of_guessing():
    result = _evaluate("Patterned blouse", "tops", None)

    assert result["verdict"] == "unknown"
    assert "color" in result["reason"].lower()


def test_tool_is_declared_and_validated():
    assert "should_i_buy" in aria_tools.READONLY_TOOLS
    assert aria_tools.validate_tool_input("should_i_buy", {"name": "  ", "category": "tops"}, CLOSET) is None
    assert aria_tools.validate_tool_input("should_i_buy", {"name": "Top", "category": "hats"}, CLOSET) is None
    assert aria_tools.validate_tool_input(
        "should_i_buy", {"name": " Rust top ", "category": "tops", "color": " rust "}, CLOSET
    ) == {"name": "Rust top", "category": "tops", "color": "rust"}


def test_tool_runs_against_the_users_closet():
    result = asyncio.run(aria_tools.execute_readonly_tool(
        "should_i_buy",
        {"name": "Rust crew blouse", "category": "tops", "color": "rust"},
        {"wardrobe": CLOSET, "color_profile": AUTUMN, "skin_analysis": SKIN},
    ))

    assert result["verdict"] == "buy"
    assert result["product"]["name"] == "Rust crew blouse"
