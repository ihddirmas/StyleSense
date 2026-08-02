"""
Unit tests for aria_tools -- tool-input validation and pending-action construction.

Pure unit tests -- no network, no Supabase/Aurora, no Anthropic calls.
Run with: .\\venv\\Scripts\\python.exe -m pytest tests/test_aria_tools_unit.py -v
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services import aria_tools


WARDROBE = [
    {"id": "abc-1", "name": "Cream sweater", "category": "tops", "image_url": "https://x.supabase.co/sweater.jpg"},
    {"id": "abc-2", "name": "Navy trousers", "category": "bottoms", "image_url": "https://x.supabase.co/trousers.jpg"},
]


# ── validate_tool_input ─────────────────────────────────────────────────── #

def test_validate_add_wardrobe_items_happy_path():
    raw = {"items": [{"name": "Blue jacket", "category": "outerwear", "color": "blue"}]}
    result = aria_tools.validate_tool_input("add_wardrobe_items", raw, WARDROBE)
    assert result == {
        "items": [{
            "name": "Blue jacket", "category": "outerwear", "color": "blue",
            "brand": None, "occasion": "casual", "position": None,
        }]
    }


def test_validate_add_wardrobe_items_drops_invalid_category():
    raw = {"items": [
        {"name": "Blue jacket", "category": "not-a-category"},
        {"name": "Cream sweater", "category": "tops"},
    ]}
    result = aria_tools.validate_tool_input("add_wardrobe_items", raw, WARDROBE)
    assert result is not None
    assert len(result["items"]) == 1
    assert result["items"][0]["name"] == "Cream sweater"


def test_validate_add_wardrobe_items_drops_unnamed_item():
    raw = {"items": [{"name": "   ", "category": "tops"}]}
    assert aria_tools.validate_tool_input("add_wardrobe_items", raw, WARDROBE) is None


def test_validate_add_wardrobe_items_empty_list_returns_none():
    assert aria_tools.validate_tool_input("add_wardrobe_items", {"items": []}, WARDROBE) is None


def test_validate_add_wardrobe_items_missing_items_key_returns_none():
    assert aria_tools.validate_tool_input("add_wardrobe_items", {}, WARDROBE) is None


def test_validate_add_wardrobe_items_caps_at_six():
    raw = {"items": [{"name": f"Item {i}", "category": "tops"} for i in range(9)]}
    result = aria_tools.validate_tool_input("add_wardrobe_items", raw, WARDROBE)
    assert len(result["items"]) == 6


def test_validate_add_wardrobe_items_normalizes_invalid_occasion():
    raw = {"items": [{"name": "Sweater", "category": "tops", "occasion": "not-real"}]}
    result = aria_tools.validate_tool_input("add_wardrobe_items", raw, WARDROBE)
    assert result["items"][0]["occasion"] == "casual"


def test_validate_unknown_tool_returns_none():
    assert aria_tools.validate_tool_input("delete_everything", {"items": []}, WARDROBE) is None


def test_validate_generate_tryon_happy_path():
    raw = {"item_ids": ["abc-1", "abc-2"], "scene": "at a beach wedding"}
    result = aria_tools.validate_tool_input("generate_tryon", raw, WARDROBE)
    assert result == {"item_ids": ["abc-1", "abc-2"], "scene": "at a beach wedding"}


def test_validate_generate_tryon_filters_unknown_ids():
    raw = {"item_ids": ["abc-1", "does-not-exist"]}
    result = aria_tools.validate_tool_input("generate_tryon", raw, WARDROBE)
    assert result == {"item_ids": ["abc-1"], "scene": None}


def test_validate_generate_tryon_all_unknown_ids_returns_none():
    raw = {"item_ids": ["nope-1", "nope-2"]}
    assert aria_tools.validate_tool_input("generate_tryon", raw, WARDROBE) is None


def test_validate_generate_tryon_empty_returns_none():
    assert aria_tools.validate_tool_input("generate_tryon", {"item_ids": []}, WARDROBE) is None


def test_validate_generate_tryon_missing_scene_defaults_none():
    result = aria_tools.validate_tool_input("generate_tryon", {"item_ids": ["abc-1"]}, WARDROBE)
    assert result["scene"] is None


def test_validate_generate_tryon_caps_at_six():
    wardrobe = [{"id": f"id-{i}", "name": f"Item {i}", "category": "tops", "image_url": "x"} for i in range(9)]
    raw = {"item_ids": [f"id-{i}" for i in range(9)]}
    result = aria_tools.validate_tool_input("generate_tryon", raw, wardrobe)
    assert len(result["item_ids"]) == 6


def test_validate_lookup_product_happy_path():
    result = aria_tools.validate_tool_input("lookup_product_from_url", {"url": "https://example.com/item"}, WARDROBE)
    assert result == {"url": "https://example.com/item"}


def test_validate_lookup_product_strips_whitespace():
    result = aria_tools.validate_tool_input("lookup_product_from_url", {"url": "  https://example.com/item  "}, WARDROBE)
    assert result == {"url": "https://example.com/item"}


def test_validate_lookup_product_blank_url_returns_none():
    assert aria_tools.validate_tool_input("lookup_product_from_url", {"url": "   "}, WARDROBE) is None


def test_validate_lookup_product_missing_url_returns_none():
    assert aria_tools.validate_tool_input("lookup_product_from_url", {}, WARDROBE) is None


# ── build_pending_action ────────────────────────────────────────────────── #

_ONE_ITEM = {"items": [
    {"name": "Blue jacket", "category": "outerwear", "color": None, "brand": None, "occasion": "casual", "position": None},
]}
_TWO_ITEMS = {"items": [
    {"name": "Blue jacket", "category": "outerwear", "color": None, "brand": None, "occasion": "casual", "position": None},
    {"name": "Cream sweater", "category": "tops", "color": None, "brand": None, "occasion": "casual", "position": None},
]}


def test_build_pending_action_requires_photo():
    assert aria_tools.build_pending_action("add_wardrobe_items", _ONE_ITEM, {"pending_photo_url": None}) is None


def test_build_pending_action_includes_photo_and_cost():
    pending = aria_tools.build_pending_action(
        "add_wardrobe_items", _TWO_ITEMS, {"pending_photo_url": "https://x.supabase.co/photo.jpg"}
    )
    assert pending["tool_name"] == "add_wardrobe_items"
    assert pending["tool_input"]["source_image_url"] == "https://x.supabase.co/photo.jpg"
    assert pending["tool_input"]["items"] == _TWO_ITEMS["items"]
    assert pending["cost_credits"] == 4
    assert "Blue jacket" in pending["summary"] and "Cream sweater" in pending["summary"]


def test_build_pending_action_unknown_tool_returns_none():
    assert aria_tools.build_pending_action("nonexistent_tool", {}, {}) is None


def test_build_pending_action_generate_tryon_requires_avatar_selfie():
    validated = {"item_ids": ["abc-1"], "scene": None}
    ctx = {"avatar_selfie_url": None, "wardrobe": WARDROBE}
    assert aria_tools.build_pending_action("generate_tryon", validated, ctx) is None


def test_build_pending_action_generate_tryon_includes_items_and_cost():
    validated = {"item_ids": ["abc-1", "abc-2"], "scene": "at a beach wedding"}
    ctx = {"avatar_selfie_url": "https://x.supabase.co/selfie.jpg", "wardrobe": WARDROBE}
    pending = aria_tools.build_pending_action("generate_tryon", validated, ctx)
    assert pending["tool_name"] == "generate_tryon"
    assert pending["tool_input"]["avatar_selfie_url"] == "https://x.supabase.co/selfie.jpg"
    assert pending["tool_input"]["scene"] == "at a beach wedding"
    assert pending["tool_input"]["items"] == [
        {"image_url": "https://x.supabase.co/sweater.jpg", "name": "Cream sweater", "category": "tops"},
        {"image_url": "https://x.supabase.co/trousers.jpg", "name": "Navy trousers", "category": "bottoms"},
    ]
    assert pending["cost_credits"] == 5
    assert "Cream sweater" in pending["summary"] and "Navy trousers" in pending["summary"]


# ── tool schema sanity ──────────────────────────────────────────────────── #

def test_anthropic_tools_declares_exactly_confirm_and_readonly_tools():
    declared = {t["name"] for t in aria_tools.ANTHROPIC_TOOLS}
    assert declared == aria_tools.CONFIRM_REQUIRED_TOOLS | aria_tools.READONLY_TOOLS
    assert aria_tools.CONFIRM_REQUIRED_TOOLS.isdisjoint(aria_tools.READONLY_TOOLS)


def test_anthropic_tools_includes_generate_tryon():
    assert "generate_tryon" in aria_tools.CONFIRM_REQUIRED_TOOLS


def test_explain_blocked_proposal_tryon_cap():
    pass  # cap messaging is handled in aria_graph via usage_limits.tryon_cap_message()


def test_explain_blocked_proposal_missing_photo():
    validated = _ONE_ITEM
    msg = aria_tools.explain_blocked_proposal(
        "add_wardrobe_items", validated, {"pending_photo_url": None}, "user-1"
    )
    assert msg is not None
    assert "Attach a photo" in msg


def test_explain_blocked_proposal_missing_selfie():
    validated = {"item_ids": ["abc-1"], "scene": None}
    ctx = {"avatar_selfie_url": None, "wardrobe": WARDROBE}
    msg = aria_tools.explain_blocked_proposal("generate_tryon", validated, ctx, "user-1")
    assert msg is not None
    assert "selfie" in msg.lower()


def test_anthropic_tools_includes_lookup_product_as_readonly():
    assert "lookup_product_from_url" in aria_tools.READONLY_TOOLS
    assert "lookup_product_from_url" not in aria_tools.CONFIRM_REQUIRED_TOOLS
