"""
Deterministic "does this suit you" scoring against a user's cached color
profile. Pure Python, no LLM/vision calls — cheap enough to run on every
wardrobe item on every page load.

Shared foundation for the analysis report (routers/stylist.py) and outfit
combo suggestions (services/outfit_combo_service.py), so the two features
never diverge on what counts as a "flattering" color.
"""
import re
from typing import Optional

Verdict = str  # "flatters" | "neutral" | "reconsider"


def _tokenize(text: str) -> set[str]:
    return set(re.findall(r"[a-z]+", text.lower()))


def _best_match(item_tokens: set[str], candidates: list[str]) -> Optional[str]:
    """First candidate phrase that shares a word with item_tokens, or None."""
    for candidate in candidates:
        if item_tokens & _tokenize(candidate):
            return candidate
    return None


def get_color_verdict(item_color: Optional[str], color_profile: Optional[dict]) -> dict:
    """
    Compare a wardrobe/product color string against the user's cached
    color_profile (from color_service.analyze_color_profile).

    Returns {"verdict": "flatters" | "neutral" | "reconsider", "reason": str}.
    Matching is word-overlap based (e.g. item "Navy" matches profile phrase
    "soft navy") — a heuristic, not exact string equality, since both sides
    are free-text color names.
    """
    if not item_color or not item_color.strip():
        return {"verdict": "neutral", "reason": "No color on file for this item yet."}
    if not color_profile:
        return {"verdict": "neutral", "reason": "Complete your color analysis to see a verdict."}

    item_tokens = _tokenize(item_color)
    if not item_tokens:
        return {"verdict": "neutral", "reason": "No color on file for this item yet."}

    flattering = color_profile.get("flattering_colors") or []
    avoid = color_profile.get("avoid_colors") or []

    match = _best_match(item_tokens, flattering)
    if match:
        return {
            "verdict": "flatters",
            "reason": f'"{item_color}" echoes your flattering "{match}" — a good pick for your coloring.',
        }

    match = _best_match(item_tokens, avoid)
    if match:
        return {
            "verdict": "reconsider",
            "reason": f'"{item_color}" is close to "{match}", which tends to wash out your coloring.',
        }

    return {
        "verdict": "neutral",
        "reason": f'"{item_color}" isn\'t in your flattering or avoid list — a safe, versatile choice.',
    }


def get_silhouette_verdict(item: dict, kibbe_ref: Optional[dict]) -> dict:
    """
    Compare a wardrobe item's name (and category) against the user's Kibbe
    type reference (from kibbe_service.get_type_reference) -- same word-overlap
    heuristic as get_color_verdict, applied to best_silhouettes/avoid phrases
    instead of flattering/avoid colors, so Kibbe body-type actually changes
    what gets recommended instead of only appearing as static reference text.

    Returns {"verdict": "flatters" | "neutral" | "reconsider", "reason": str}.
    """
    item_text = f"{item.get('name') or ''} {item.get('category') or ''}".strip()
    if not item_text:
        return {"verdict": "neutral", "reason": "No name on file for this item yet."}
    if not kibbe_ref:
        return {"verdict": "neutral", "reason": "Complete your body-type analysis to see a verdict."}

    item_tokens = _tokenize(item_text)
    if not item_tokens:
        return {"verdict": "neutral", "reason": "No name on file for this item yet."}

    best_silhouettes = [s.strip() for s in (kibbe_ref.get("best_silhouettes") or "").split(",") if s.strip()]
    avoid = [s.strip() for s in (kibbe_ref.get("avoid") or "").split(",") if s.strip()]

    match = _best_match(item_tokens, best_silhouettes)
    if match:
        return {
            "verdict": "flatters",
            "reason": f'"{item.get("name")}" echoes your best-line "{match}" — suits your body-type line.',
        }

    match = _best_match(item_tokens, avoid)
    if match:
        return {
            "verdict": "reconsider",
            "reason": f'"{item.get("name")}" is close to "{match}", which tends to fight your natural line.',
        }

    return {
        "verdict": "neutral",
        "reason": f'"{item.get("name")}" isn\'t in your best-line or avoid list for your body type.',
    }


def score_items(items: list[dict], color_profile: Optional[dict], kibbe_ref: Optional[dict] = None) -> int:
    """
    Net score for a group of items: +1 per flattering piece, -1 per reconsider
    piece, judged on color always and on Kibbe silhouette fit too when a
    kibbe_ref is supplied (kept optional so callers without a Kibbe profile
    on file keep their original color-only score, unchanged).
    """
    score = 0
    for item in items:
        verdict = get_color_verdict(item.get("color"), color_profile)["verdict"]
        if verdict == "flatters":
            score += 1
        elif verdict == "reconsider":
            score -= 1

        if kibbe_ref:
            silhouette_verdict = get_silhouette_verdict(item, kibbe_ref)["verdict"]
            if silhouette_verdict == "flatters":
                score += 1
            elif silhouette_verdict == "reconsider":
                score -= 1
    return score
