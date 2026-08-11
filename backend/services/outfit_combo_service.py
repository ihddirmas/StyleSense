"""
Outfit-combo suggestions from a user's own wardrobe.

Candidate generation is deterministic (pair every top with every bottom,
plus each dress alone, each optionally finished with the best-scoring
available shoe) and scored via suitability_service against the user's color
profile AND Kibbe body-type reference (when on file) -- so a user's body-type
line actually changes which combos rank highest, not just their color. One
Claude call captions the top few candidates -- it only ever sees pre-vetted
real items, so it cannot hallucinate a combo that doesn't exist in the
wardrobe.
"""
from collections import defaultdict
from typing import Optional

from services.suitability_service import score_items, get_silhouette_verdict

MAX_CANDIDATES = 8
MAX_CAPTIONED = 5


def _group_by_category(items: list[dict]) -> dict[str, list[dict]]:
    groups: dict[str, list[dict]] = defaultdict(list)
    for item in items:
        groups[(item.get("category") or "other").lower()].append(item)
    return groups


def _best_shoe(shoes: list[dict], color_profile: Optional[dict], kibbe_ref: Optional[dict] = None) -> Optional[dict]:
    if not shoes:
        return None
    return max(shoes, key=lambda s: score_items([s], color_profile, kibbe_ref))


def generate_candidate_combos(
    items: list[dict], color_profile: Optional[dict], kibbe_ref: Optional[dict] = None
) -> list[dict]:
    """
    Returns up to MAX_CANDIDATES {"items": [...], "score": int} dicts, sorted
    by score descending. Pairs every top with every bottom, plus each dress
    alone, each optionally finished with the single best-scoring shoe.
    kibbe_ref (kibbe_service.get_type_reference(...) shape) is optional --
    omitting it keeps the original color-only score.
    """
    groups = _group_by_category(items)
    tops = groups.get("tops", [])
    bottoms = groups.get("bottoms", [])
    dresses = groups.get("dresses", [])
    shoe = _best_shoe(groups.get("shoes", []), color_profile, kibbe_ref)
    shoe_tail = [shoe] if shoe else []

    combos: list[dict] = []
    for top in tops:
        for bottom in bottoms:
            combo_items = [top, bottom] + shoe_tail
            combos.append({"items": combo_items, "score": score_items(combo_items, color_profile, kibbe_ref)})
    for dress in dresses:
        combo_items = [dress] + shoe_tail
        combos.append({"items": combo_items, "score": score_items(combo_items, color_profile, kibbe_ref)})

    combos.sort(key=lambda c: c["score"], reverse=True)
    return combos[:MAX_CANDIDATES]


def _kibbe_highlight(combo_items: list[dict], kibbe_ref: Optional[dict]) -> Optional[str]:
    """First item in the combo whose silhouette flatters the user's Kibbe
    type, as a user-facing reason string -- None if no kibbe_ref or no match."""
    if not kibbe_ref:
        return None
    for item in combo_items:
        verdict = get_silhouette_verdict(item, kibbe_ref)
        if verdict["verdict"] == "flatters":
            return verdict["reason"]
    return None


def _summarize(combo_items: list[dict]) -> str:
    return " + ".join(f"{it.get('name', 'item')} ({it.get('color') or '?'})" for it in combo_items)


def _public_item(item: dict) -> dict:
    return {
        "id": item["id"],
        "name": item.get("name"),
        "color": item.get("color"),
        "category": item.get("category"),
        "image_url": item.get("image_url"),
    }


def build_outfit_suggestions(
    items: list[dict], color_profile: Optional[dict], kibbe_ref: Optional[dict] = None
) -> list[dict]:
    """
    Full pipeline: generate candidates, caption the top MAX_CAPTIONED via one
    Claude call. Falls back to a generic caption per combo if that call fails
    or returns nothing usable -- this must never hard-fail the endpoint.
    """
    from services import anthropic_service  # lazy: keeps this module importable without ANTHROPIC_API_KEY set

    candidates = generate_candidate_combos(items, color_profile, kibbe_ref)
    if not candidates:
        return []

    top = candidates[:MAX_CAPTIONED]
    summaries = [_summarize(c["items"]) for c in top]
    captions = anthropic_service.caption_outfit_combos(summaries)

    results: list[dict] = []
    for i, combo in enumerate(top):
        caption = (captions[i] if captions and i < len(captions) else "") or (
            "A flattering pairing from your color palette."
        )
        results.append({
            "items": [_public_item(it) for it in combo["items"]],
            "caption": caption,
            "kibbe_note": _kibbe_highlight(combo["items"], kibbe_ref),
            "score": combo["score"],
        })
    return results
