"""
Buy or skip: judge a product against the person and the closet they already have.

The cost of a purchase isn't only its price: it has to suit you, work with what you
own, and not be something you already have. Pure Python, nothing spent. Availability
is ignored here, because something in the laundry today is still owned.
"""
from typing import Optional

from services import look_check_service as look_check

_SIMILAR_DELTA_E = 10.0
_MIN_OUTFITS_TO_BUY = 2
_PAIRS_WITH = {"tops": "bottoms", "bottoms": "tops"}
_MAX_LISTED = 3


def _brief(item: dict) -> dict:
    return {"id": item.get("id"), "name": item.get("name"), "image_url": item.get("image_url")}


def _status(result: dict, check: str) -> dict:
    return next(c for c in result["checks"] if c["check"] == check)


def _pairs_with(product: dict, wardrobe: list[dict]) -> list[dict]:
    partner_category = _PAIRS_WITH.get(product["category"])
    if not partner_category:
        return []
    partners = [it for it in wardrobe if (it.get("category") or "").lower() == partner_category]
    return [
        partner
        for partner in partners
        if _status(look_check.check_outfit([product, partner]), "color_together")["status"]
        not in (look_check.FAIL, look_check.WARN)
    ]


def _similar_owned(product: dict, wardrobe: list[dict]) -> list[dict]:
    product_hex = look_check._garment_hex(product)
    if not product_hex:
        return []
    product_lab = look_check.hex_to_lab(product_hex)
    same_category = [it for it in wardrobe if (it.get("category") or "").lower() == product["category"]]
    return [
        it
        for it in same_category
        if (owned := look_check._garment_hex(it))
        and look_check.delta_e_2000(product_lab, look_check.hex_to_lab(owned)) < _SIMILAR_DELTA_E
    ]


def _decide(color_status: str, has_color: bool, outfits: int, similar: list[dict], category: str) -> tuple[str, str]:
    if not has_color:
        return "unknown", "I can't tell this product's color, so I won't judge it. What color is it?"
    if category in _PAIRS_WITH and outfits == 0:
        return "skip", "You own nothing that pairs with this yet, so it would sit unworn."
    if similar:
        return "think", f"You already own something close: {similar[0].get('name')}."
    if color_status in (look_check.WARN, look_check.FAIL):
        return "think", "The color works against your palette or skin tone, so it would need a fix near your face."
    if category in _PAIRS_WITH and outfits < _MIN_OUTFITS_TO_BUY:
        return "think", f"It only makes {outfits} outfit with what you own."
    return "buy", f"It suits you and makes {outfits} {'outfit' if outfits == 1 else 'outfits'} with what you own."


def evaluate(
    product: dict,
    wardrobe: list[dict],
    *,
    color_profile: Optional[dict] = None,
    kibbe_ref: Optional[dict] = None,
    skin_analysis: Optional[dict] = None,
) -> dict:
    """Returns {verdict: buy | think | skip | unknown, reason, color, outfits_with_closet,
    pairs_with, similar_owned, product}."""
    item = {**product, "id": "product", "category": (product.get("category") or "").lower()}
    has_color = bool(look_check._garment_hex(item))
    result = look_check.check_outfit(
        [item], color_profile=color_profile, kibbe_ref=kibbe_ref, skin_analysis=skin_analysis,
    )
    color = _status(result, "color_on_you")

    pairs = _pairs_with(item, wardrobe)
    outfits = 1 if item["category"] == "dresses" else len(pairs)
    similar = _similar_owned(item, wardrobe)
    verdict, reason = _decide(color["status"], has_color, outfits, similar, item["category"])

    return {
        "verdict": verdict,
        "reason": reason,
        "product": {"name": product.get("name"), "category": item["category"], "color": product.get("color")},
        "color": {
            "status": color["status"],
            "reasons": [f["reason"] for f in color["findings"]],
        },
        "outfits_with_closet": outfits,
        "pairs_with": [_brief(p) for p in pairs[:_MAX_LISTED]],
        "similar_owned": [_brief(s) for s in similar[:_MAX_LISTED]],
        "measured_skin": result["measured_skin"],
    }
