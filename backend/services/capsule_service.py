"""Trip / capsule wardrobe planning from owned items + style profiles (Phase 1)."""
from __future__ import annotations

import json
import logging
import re
from collections import Counter
from typing import Any, Optional

from services import anthropic_service, color_service, kibbe_service

logger = logging.getLogger(__name__)

_DRESS_REQUIREMENTS: dict[str, set[str]] = {
    "business": {"tops", "bottoms", "shoes"},
    "smart casual": {"tops", "bottoms", "shoes"},
    "casual": {"tops", "bottoms", "shoes"},
    "formal": {"tops", "bottoms", "shoes", "outerwear"},
    "beach": {"tops", "bottoms", "shoes"},
    "evening": {"tops", "bottoms", "shoes", "accessories"},
}


def _wardrobe_by_category(wardrobe: list) -> dict[str, list]:
    out: dict[str, list] = {}
    for w in wardrobe or []:
        cat = (w.get("category") or "accessories").lower()
        out.setdefault(cat, []).append(w)
    return out


def list_wardrobe_gaps(
    wardrobe: list,
    *,
    dress_code: str = "business",
    days: int = 5,
    color_profile: Optional[dict] = None,
    kibbe_analysis: Optional[dict] = None,
) -> dict[str, Any]:
    """Rule-based gap analysis — no LLM cost."""
    dress_code = (dress_code or "business").strip().lower()
    days = max(1, min(int(days or 5), 14))
    by_cat = _wardrobe_by_category(wardrobe)
    required = _DRESS_REQUIREMENTS.get(dress_code, _DRESS_REQUIREMENTS["business"])

    gaps: list[dict[str, str]] = []
    for cat in required:
        count = len(by_cat.get(cat, []))
        need = max(1, (days + 2) // 2) if cat in ("tops", "bottoms") else 1
        if count < need:
            gaps.append({
                "category": cat,
                "have": str(count),
                "need": str(need),
                "suggestion": f"Add {need - count} more {cat} for a {days}-day {dress_code} trip",
            })

    if not by_cat.get("outerwear") and dress_code in ("business", "formal", "smart casual"):
        gaps.append({
            "category": "outerwear",
            "have": "0",
            "need": "1",
            "suggestion": "Packable blazer or light coat for AC / evenings",
        })

    season = (color_profile or {}).get("season")
    tips: list[str] = []
    if season:
        tips.append(f"Favour your {season} palette when filling gaps.")
    kibbe = (kibbe_analysis or {}).get("kibbe_type")
    if kibbe:
        tips.append(f"Silhouette tip for {kibbe}: honour your vertical line when choosing replacements.")

    return {
        "dress_code": dress_code,
        "days": days,
        "gaps": gaps,
        "wardrobe_counts": {k: len(v) for k, v in by_cat.items()},
        "style_tips": tips,
    }


def plan_trip_capsule(
    wardrobe: list,
    *,
    destination: str,
    days: int,
    dress_code: str = "business",
    climate_notes: Optional[str] = None,
    color_profile: Optional[dict] = None,
    kibbe_analysis: Optional[dict] = None,
) -> dict[str, Any]:
    """Build a day-by-day outfit plan from owned wardrobe (Haiku + strict JSON)."""
    days = max(1, min(int(days or 3), 14))
    destination = (destination or "your trip").strip()[:120]
    dress_code = (dress_code or "business").strip()[:40]
    climate = (climate_notes or "").strip()[:200]

    gaps_preview = list_wardrobe_gaps(
        wardrobe, dress_code=dress_code, days=days,
        color_profile=color_profile, kibbe_analysis=kibbe_analysis,
    )

    if not wardrobe:
        return {
            "destination": destination,
            "days": days,
            "dress_code": dress_code,
            "daily_outfits": [],
            "gaps": gaps_preview["gaps"],
            "packing_notes": ["Add items to your wardrobe first — I can only plan from what you own."],
            "coverage_pct": 0,
        }

    wardrobe_text = anthropic_service._format_wardrobe(wardrobe)
    system = f"""You are a capsule wardrobe planner. Output ONLY valid JSON (no markdown).
Plan {days} days for {destination}, dress code: {dress_code}.
{('Climate: ' + climate) if climate else ''}

Use ONLY wardrobe item IDs from the list. Reuse pieces across days (capsule logic).
{color_service.format_color_profile(color_profile)}
{kibbe_service.format_kibbe_profile(kibbe_analysis)}

JSON shape:
{{
  "daily_outfits": [
    {{"day": 1, "label": "short title", "item_ids": ["uuid", ...], "notes": "why this works"}}
  ],
  "gaps": [{{"category": "tops", "description": "what to buy/pack", "why": "reason"}}],
  "packing_notes": ["bullet strings"],
  "coverage_pct": 0-100
}}

WARDROBE:
{wardrobe_text}
"""

    try:
        resp = anthropic_service.client.messages.create(
            model=anthropic_service.MODEL,
            max_tokens=1200,
            temperature=0.4,
            system=system,
            messages=[{"role": "user", "content": f"Plan my {days}-day capsule for {destination}."}],
        )
        raw = "".join(b.text for b in resp.content if hasattr(b, "text"))
        match = re.search(r"\{[\s\S]*\}", raw)
        if not match:
            raise ValueError("no JSON in model response")
        data = json.loads(match.group())
    except Exception as exc:
        logger.warning("capsule LLM plan failed: %s", exc)
        data = {"daily_outfits": [], "gaps": [], "packing_notes": [], "coverage_pct": 0}

    item_map = {w["id"]: w for w in wardrobe if w.get("id")}
    daily: list[dict] = []
    for row in data.get("daily_outfits") or []:
        ids = [i for i in (row.get("item_ids") or []) if i in item_map]
        daily.append({
            "day": row.get("day"),
            "label": row.get("label") or f"Day {row.get('day')}",
            "item_ids": ids,
            "items": [{"id": i, "name": item_map[i]["name"], "category": item_map[i].get("category")} for i in ids],
            "notes": row.get("notes") or "",
        })

    merged_gaps = data.get("gaps") or gaps_preview["gaps"]
    if not merged_gaps and gaps_preview["gaps"]:
        merged_gaps = gaps_preview["gaps"]

    return {
        "destination": destination,
        "days": days,
        "dress_code": dress_code,
        "climate_notes": climate or None,
        "daily_outfits": daily,
        "gaps": merged_gaps,
        "packing_notes": data.get("packing_notes") or [],
        "coverage_pct": int(data.get("coverage_pct") or 0),
    }
