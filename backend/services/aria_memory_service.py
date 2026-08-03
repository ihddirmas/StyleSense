"""Lightweight long-term memory for Aria (JSONB on users.aria_memory).

Stores verdict feedback, style loves/avoid lists, and optional budget — no vector DB.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from services import supabase_service

MAX_FEEDBACK = 50
MAX_LOVES = 30
MAX_AVOID = 30


def _empty() -> dict[str, Any]:
    return {"verdict_feedback": [], "loves": [], "avoid": [], "budget_inr": None, "notes": []}


def get_memory(user_id: str) -> dict[str, Any]:
    row = supabase_service.get_user(user_id) or {}
    raw = row.get("aria_memory")
    if not isinstance(raw, dict):
        return _empty()
    out = _empty()
    for key in out:
        if key in raw:
            out[key] = raw[key]
    return out


def save_memory(user_id: str, memory: dict[str, Any]) -> None:
    supabase_service.upsert_user(user_id, aria_memory=memory)


def append_verdict_feedback(
    user_id: str,
    *,
    rating: str,
    verdict: Optional[str] = None,
    item_ids: Optional[list[str]] = None,
    url: Optional[str] = None,
    note: Optional[str] = None,
) -> dict[str, Any]:
    if rating not in ("up", "down"):
        raise ValueError("rating must be 'up' or 'down'")
    mem = get_memory(user_id)
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "rating": rating,
        "verdict": verdict,
        "item_ids": item_ids or [],
        "url": url,
        "note": (note or "").strip() or None,
    }
    mem["verdict_feedback"] = (mem.get("verdict_feedback") or [])[-(MAX_FEEDBACK - 1) :] + [entry]
    if rating == "up" and note:
        loves = list(mem.get("loves") or [])
        if note not in loves:
            loves.append(note)
        mem["loves"] = loves[-MAX_LOVES:]
    if rating == "down" and note:
        avoid = list(mem.get("avoid") or [])
        if note not in avoid:
            avoid.append(note)
        mem["avoid"] = avoid[-MAX_AVOID:]
    save_memory(user_id, mem)
    return mem


def format_for_prompt(memory: Optional[dict[str, Any]]) -> str:
    if not memory:
        return "(no long-term memory yet)"
    lines: list[str] = []
    budget = memory.get("budget_inr")
    if isinstance(budget, dict) and (budget.get("min") or budget.get("max")):
        lines.append(f"- Budget (INR): {budget.get('min', '?')}–{budget.get('max', '?')}")
    for label, key in (("Loves", "loves"), ("Avoid", "avoid")):
        vals = memory.get(key) or []
        if vals:
            lines.append(f"- {label}: {', '.join(str(v) for v in vals[-8:])}")
    feedback = memory.get("verdict_feedback") or []
    recent = [f for f in feedback if f.get("rating")][-5:]
    for f in recent:
        r = "liked" if f.get("rating") == "up" else "disliked"
        v = f.get("verdict") or f.get("note") or "a recommendation"
        lines.append(f"- Recently {r}: {v}")
    return "\n".join(lines) if lines else "(no long-term memory yet)"
