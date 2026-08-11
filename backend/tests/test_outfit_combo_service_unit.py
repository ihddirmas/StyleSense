"""
Unit tests for outfit_combo_service.generate_candidate_combos.

Pure unit tests -- no network, no Supabase, no Anthropic credits (does not
exercise build_outfit_suggestions, which makes a live Claude call).
Run with: .\\venv\\Scripts\\python.exe -m pytest tests/test_outfit_combo_service_unit.py -v
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.outfit_combo_service import generate_candidate_combos


WINTER_PROFILE = {
    "season": "winter",
    "flattering_colors": ["true black", "royal blue", "emerald"],
    "avoid_colors": ["mustard"],
}

# Mirrors kibbe_service.get_type_reference("soft_natural") shape.
SOFT_NATURAL_KIBBE_REF = {
    "best_silhouettes": "flowing tops, soft pants, relaxed dresses, cozy knits, bohemian layers",
    "avoid": "sharp tailoring, stiff fabrics, overly delicate/girly styles, severe minimalism",
}


def _item(item_id, name, category, color):
    return {"id": item_id, "name": name, "category": category, "color": color}


def test_pairs_every_top_with_every_bottom():
    items = [
        _item("t1", "Royal blue shirt", "tops", "royal blue"),
        _item("t2", "Mustard shirt", "tops", "mustard"),
        _item("b1", "Black trousers", "bottoms", "true black"),
    ]
    combos = generate_candidate_combos(items, WINTER_PROFILE)
    assert len(combos) == 2  # 2 tops x 1 bottom


def test_best_scoring_combo_ranks_first():
    items = [
        _item("t1", "Royal blue shirt", "tops", "royal blue"),   # flatters
        _item("t2", "Mustard shirt", "tops", "mustard"),          # reconsider
        _item("b1", "Black trousers", "bottoms", "true black"),   # flatters
    ]
    combos = generate_candidate_combos(items, WINTER_PROFILE)
    top_combo = combos[0]
    item_names = {it["name"] for it in top_combo["items"]}
    assert "Royal blue shirt" in item_names
    assert top_combo["score"] == 2


def test_dress_alone_is_a_valid_candidate():
    items = [_item("d1", "Emerald dress", "dresses", "emerald")]
    combos = generate_candidate_combos(items, WINTER_PROFILE)
    assert len(combos) == 1
    assert combos[0]["items"][0]["name"] == "Emerald dress"


def test_best_shoe_attached_to_every_combo():
    items = [
        _item("t1", "Royal blue shirt", "tops", "royal blue"),
        _item("b1", "Black trousers", "bottoms", "true black"),
        _item("s1", "Mustard heels", "shoes", "mustard"),
        _item("s2", "Emerald flats", "shoes", "emerald"),
    ]
    combos = generate_candidate_combos(items, WINTER_PROFILE)
    assert len(combos) == 1
    shoe_names = {it["name"] for it in combos[0]["items"]}
    assert "Emerald flats" in shoe_names  # best-scoring shoe, not the first one
    assert "Mustard heels" not in shoe_names


def test_no_tops_bottoms_or_dresses_returns_empty():
    items = [_item("s1", "Black boots", "shoes", "true black")]
    assert generate_candidate_combos(items, WINTER_PROFILE) == []


def test_empty_wardrobe_returns_empty():
    assert generate_candidate_combos([], WINTER_PROFILE) == []


def test_caps_at_max_candidates():
    tops = [_item(f"t{i}", f"Top {i}", "tops", "royal blue") for i in range(5)]
    bottoms = [_item(f"b{i}", f"Bottom {i}", "bottoms", "true black") for i in range(5)]
    combos = generate_candidate_combos(tops + bottoms, WINTER_PROFILE)
    assert len(combos) == 8  # MAX_CANDIDATES, even though 5x5=25 pairs exist


def test_kibbe_ref_boosts_combo_whose_silhouette_matches_the_users_type():
    items = [
        _item("t1", "Flowing blouse", "tops", "true black"),          # color +1, silhouette +1 = 2
        _item("t2", "Sharp tailoring blazer", "tops", "true black"),  # color +1, silhouette -1 = 0
        _item("b1", "Black trousers", "bottoms", "true black"),       # color +1, no silhouette match
    ]
    combos = generate_candidate_combos(items, WINTER_PROFILE, SOFT_NATURAL_KIBBE_REF)
    top_combo = combos[0]
    item_names = {it["name"] for it in top_combo["items"]}
    assert "Flowing blouse" in item_names
    assert top_combo["score"] == 3  # 2 (flowing blouse) + 1 (black trousers, color only)


def test_kibbe_ref_is_optional_and_leaves_color_only_score_unchanged():
    items = [
        _item("t1", "Royal blue shirt", "tops", "royal blue"),
        _item("b1", "Black trousers", "bottoms", "true black"),
    ]
    combos_without = generate_candidate_combos(items, WINTER_PROFILE)
    combos_with_none = generate_candidate_combos(items, WINTER_PROFILE, None)
    assert combos_without[0]["score"] == combos_with_none[0]["score"] == 2
