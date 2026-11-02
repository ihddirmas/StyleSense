"""
Eliminate a closet down to the outfits that survive today.

Runs every top + bottom (or dress) + shoes + outerwear combination through
look_check_service and removes them stage by stage, recording what each stage cut
and why. Pure Python: no network, no LLM, nothing spent. Try-on happens only after
this, on a survivor.

Hard stages (can't wear it, wrong for the room, can't walk in it) always cut.
Soft stages (weather, color, pairing, shape) cut only while something else remains,
because a preference should never leave someone with nothing to wear.
"""
import random
from collections import Counter
from itertools import product
from typing import Optional

from services import look_check_service as look_check

MAX_COMBOS = 300
MAX_SURVIVORS = 3
_MAX_REASONS = 3

_HARD_STAGES = ("availability", "occasion", "footwear")
_SOFT_STAGES = ("weather", "color_on_you", "color_together", "shape")

# Fixed seed: the same closet and context must always give the same answer.
_SAMPLE_SEED = 7


def _by_category(items: list[dict], category: str) -> list[dict]:
    return [it for it in items if (it.get("category") or "").lower() == category]


def _all_combos(wardrobe: list[dict]) -> list[tuple]:
    """Every wearable base (top + bottom, or a dress) x shoes x optional outerwear."""
    tops, bottoms = _by_category(wardrobe, "tops"), _by_category(wardrobe, "bottoms")
    bases = [(t, b) for t in tops for b in bottoms] + [(d,) for d in _by_category(wardrobe, "dresses")]
    if not bases:
        return []
    shoes = [(s,) for s in _by_category(wardrobe, "shoes")] or [()]
    outer = [()] + [(o,) for o in _by_category(wardrobe, "outerwear")]
    return [base + shoe + coat for base, shoe, coat in product(bases, shoes, outer)]


def _status(check_result: dict, check: str) -> dict:
    return next(c for c in check_result["checks"] if c["check"] == check)


def _top_reasons(cut: list[dict], check: str) -> list[str]:
    reasons = Counter(
        finding["reason"]
        for result in cut
        for finding in _status(result, check)["findings"]
        if finding["status"] in (look_check.FAIL, look_check.WARN)
    )
    return [reason for reason, _ in reasons.most_common(_MAX_REASONS)]


def _run_stage(check: str, remaining: list[dict]) -> tuple[dict, list[dict]]:
    statuses = [_status(r, check)["status"] for r in remaining]
    is_hard = check in _HARD_STAGES
    blocked = {look_check.FAIL} if is_hard else {look_check.FAIL, look_check.WARN}
    cut = [r for r, s in zip(remaining, statuses) if s in blocked]
    kept = [r for r, s in zip(remaining, statuses) if s not in blocked]

    kept_with_warning = 0
    if not is_hard and not kept:
        # A preference can't leave them with nothing to wear: keep all, flagged.
        kept, cut, kept_with_warning = cut, [], len(cut)
    elif is_hard:
        kept_with_warning = sum(1 for r in kept if _status(r, check)["status"] == look_check.WARN)

    no_data = bool(remaining) and all(s == look_check.UNKNOWN for s in statuses)
    stage = {
        "check": check,
        "label": look_check.CHECK_LABELS[check],
        "before": len(remaining),
        "cut": len(cut),
        "kept_with_warning": kept_with_warning,
        "status": "no_data" if no_data else ("cut" if cut else "clear"),
        "reasons": _top_reasons(cut if cut else (kept if kept_with_warning else []), check),
        "no_data_reason": _status(remaining[0], check)["findings"][0]["reason"] if no_data else None,
    }
    return stage, kept


def _score(result: dict) -> tuple:
    statuses = [c["status"] for c in result["checks"]]
    warns = statuses.count(look_check.WARN)
    passes = statuses.count(look_check.PASS)
    # Stable last key so ties don't depend on input order.
    return (warns, -passes, "|".join(sorted(i["id"] for i in result["_combo"])))


def _main_piece(result: dict) -> Optional[str]:
    return next((i["id"] for i in result["_combo"] if (i.get("category") or "").lower() in ("tops", "dresses")), None)


def _pick_survivors(remaining: list[dict]) -> list[dict]:
    ranked = sorted(remaining, key=_score)
    picked, used = [], set()
    for result in ranked:
        main = _main_piece(result)
        if main not in used:
            picked, used = [*picked, result], used | {main}
        if len(picked) == MAX_SURVIVORS:
            return picked
    extras = [r for r in ranked if r not in picked]
    return (picked + extras)[:MAX_SURVIVORS]


def _present(result: dict) -> dict:
    return {
        "items": [
            {"id": i.get("id"), "name": i.get("name"), "category": i.get("category"), "image_url": i.get("image_url")}
            for i in result["_combo"]
        ],
        "verdict": result["verdict"],
        "headline": result["headline"],
        "warnings": [f["reason"] for c in result["checks"] for f in c["findings"] if f["status"] == look_check.WARN],
        "unknowns": result["unknowns"],
        "confidence": result["confidence"],
    }


def eliminate(
    wardrobe: list[dict],
    *,
    color_profile: Optional[dict] = None,
    kibbe_ref: Optional[dict] = None,
    skin_analysis: Optional[dict] = None,
    occasion: Optional[str] = None,
    temp_c: Optional[float] = None,
    raining: Optional[bool] = None,
    walk_minutes: Optional[int] = None,
    transport: Optional[str] = None,
) -> dict:
    """Returns {total_combos, checked_combos, stages, survivors, survivor_count,
    missing_context, measured_skin, garment_colors_measured}."""
    combos = _all_combos(wardrobe)
    total = len(combos)
    if total > MAX_COMBOS:
        combos = random.Random(_SAMPLE_SEED).sample(combos, MAX_COMBOS)

    results = [
        {
            **look_check.check_outfit(
                list(combo), color_profile=color_profile, kibbe_ref=kibbe_ref, skin_analysis=skin_analysis,
                occasion=occasion, temp_c=temp_c, raining=raining, walk_minutes=walk_minutes, transport=transport,
            ),
            "_combo": list(combo),
        }
        for combo in combos
    ]

    stages, remaining = [], results
    for check in (*_HARD_STAGES, *_SOFT_STAGES):
        stage, remaining = _run_stage(check, remaining)
        stages = [*stages, stage]

    return {
        "total_combos": total,
        "checked_combos": len(results),
        "stages": stages if results else [],
        "survivors": [_present(r) for r in _pick_survivors(remaining)],
        "survivor_count": len(remaining),
        "missing_context": [s["check"] for s in stages if s["status"] == "no_data"] if results else [],
        "measured_skin": any(r["measured_skin"] for r in results),
        "garment_colors_measured": bool(results) and all(r["garment_colors_measured"] for r in results),
    }
