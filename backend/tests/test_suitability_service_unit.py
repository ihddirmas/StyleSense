"""
Unit tests for suitability_service.get_color_verdict / get_silhouette_verdict / score_items.

Pure unit tests -- no network, no Supabase, no Runway/Anthropic credits.
Run with: .\\venv\\Scripts\\python.exe -m pytest tests/test_suitability_service_unit.py -v
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.suitability_service import get_color_verdict, get_silhouette_verdict, score_items


WINTER_PROFILE = {
    "season": "winter",
    "flattering_colors": ["true black", "royal blue", "emerald", "icy blue"],
    "avoid_colors": ["mustard", "warm beige", "peach"],
}

# Mirrors kibbe_service.get_type_reference("soft_natural") shape.
SOFT_NATURAL_KIBBE_REF = {
    "best_silhouettes": "flowing tops, soft pants, relaxed dresses, cozy knits, bohemian layers",
    "avoid": "sharp tailoring, stiff fabrics, overly delicate/girly styles, severe minimalism",
}


def test_flattering_color_matches_by_word_overlap():
    result = get_color_verdict("Royal Blue", WINTER_PROFILE)
    assert result["verdict"] == "flatters"
    assert "royal blue" in result["reason"].lower()


def test_flattering_color_matches_partial_phrase():
    # item color "Navy" vs profile phrase "royal blue" should NOT match (no shared word);
    # but "Emerald green" should match profile's "emerald" via word overlap.
    result = get_color_verdict("Emerald Green", WINTER_PROFILE)
    assert result["verdict"] == "flatters"


def test_avoid_color_matches():
    result = get_color_verdict("Mustard", WINTER_PROFILE)
    assert result["verdict"] == "reconsider"


def test_unrelated_color_is_neutral():
    result = get_color_verdict("Navy", WINTER_PROFILE)
    assert result["verdict"] == "neutral"


def test_missing_item_color_is_neutral():
    result = get_color_verdict(None, WINTER_PROFILE)
    assert result["verdict"] == "neutral"

    result = get_color_verdict("", WINTER_PROFILE)
    assert result["verdict"] == "neutral"


def test_missing_profile_is_neutral():
    result = get_color_verdict("Royal Blue", None)
    assert result["verdict"] == "neutral"


def test_score_items_nets_flattering_and_reconsider():
    items = [
        {"color": "Royal Blue"},   # flatters: +1
        {"color": "Emerald"},      # flatters: +1
        {"color": "Mustard"},      # reconsider: -1
        {"color": "Navy"},         # neutral: 0
    ]
    assert score_items(items, WINTER_PROFILE) == 1


def test_score_items_empty_list_is_zero():
    assert score_items([], WINTER_PROFILE) == 0


def test_silhouette_flatters_when_item_name_matches_best_silhouettes():
    result = get_silhouette_verdict({"name": "Flowing Top", "category": "tops"}, SOFT_NATURAL_KIBBE_REF)
    assert result["verdict"] == "flatters"


def test_silhouette_reconsider_when_item_name_matches_avoid():
    result = get_silhouette_verdict({"name": "Sharp Tailoring Blazer"}, SOFT_NATURAL_KIBBE_REF)
    assert result["verdict"] == "reconsider"


def test_silhouette_neutral_when_no_match():
    result = get_silhouette_verdict({"name": "Blue Item"}, SOFT_NATURAL_KIBBE_REF)
    assert result["verdict"] == "neutral"


def test_silhouette_neutral_when_no_kibbe_ref():
    result = get_silhouette_verdict({"name": "Flowing Top"}, None)
    assert result["verdict"] == "neutral"


def test_silhouette_neutral_when_kibbe_ref_missing_fields():
    result = get_silhouette_verdict({"name": "Flowing Top"}, {})
    assert result["verdict"] == "neutral"


def test_silhouette_neutral_when_item_missing_name():
    result = get_silhouette_verdict({}, SOFT_NATURAL_KIBBE_REF)
    assert result["verdict"] == "neutral"


def test_score_items_without_kibbe_ref_matches_original_color_only_behavior():
    items = [
        {"color": "Royal Blue", "name": "Flowing Top"},
        {"color": "Mustard", "name": "Sharp Tailoring Blazer"},
    ]
    assert score_items(items, WINTER_PROFILE) == 0  # +1 -1, silhouette not considered


def test_score_items_nets_color_and_silhouette_when_kibbe_ref_given():
    items = [{"color": "Royal Blue", "name": "Flowing Top"}]  # color flatters (+1), silhouette flatters (+1)
    assert score_items(items, WINTER_PROFILE, SOFT_NATURAL_KIBBE_REF) == 2


def test_score_items_silhouette_reconsider_lowers_score():
    items = [{"color": "Mustard", "name": "Sharp Tailoring Blazer"}]  # color -1, silhouette -1
    assert score_items(items, WINTER_PROFILE, SOFT_NATURAL_KIBBE_REF) == -2
