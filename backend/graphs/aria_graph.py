"""
Aria stylist agent (LangGraph).

A small stateful graph that makes the stylist reason like a real one:

    ensure_profile -> detect_occasion -> retrieve_kb -> advise

- ensure_profile: lazily analyzes the user's selfie into a cached color profile.
- detect_occasion: deterministic keyword match from the latest user message.
- retrieve_kb: pulls color + occasion snippets from the curated knowledge base.
- advise: Claude Haiku reply grounded in wardrobe + color profile + KB, keeping
  the [ITEM:<id>] format the UI parses.

Nodes call the existing anthropic client directly (no langchain-anthropic).
"""
import os
import logging
from typing import Optional, TypedDict

from langgraph.graph import StateGraph, START, END

from services import supabase_service, anthropic_service, style_kb, color_service

logger = logging.getLogger(__name__)

# Stronger model for the actual outfit reasoning (Haiku is the fast fallback).
ADVISE_MODEL = os.getenv("ARIA_ADVISE_MODEL", "claude-sonnet-4-6")


class AriaState(TypedDict, total=False):
    user_id: str
    messages: list           # [{role, content}]
    wardrobe: list
    color_profile: Optional[dict]
    occasion: Optional[str]
    scene: Optional[str]
    kb_snippets: list
    style_preferences: list  # from this-or-that choices
    reply: str
    item_ids: list


# Maps a detected occasion to a rich try-on background, used when the user clicks
# "Manifest this look" in chat so the generated photo matches the event they asked about.
_OCCASION_SCENE = {
    "beach wedding": "at a beach wedding by the sea at golden hour, soft warm light",
    "formal": "at an elegant black-tie gala in a grand ballroom, refined lighting",
    "wedding guest": "at a stylish wedding reception, soft romantic lighting",
    "office": "in a bright modern office, clean professional setting",
    "office party": "at a stylish office holiday party, warm ambient evening light",
    "interview": "in a modern office lobby for a job interview, crisp daylight",
    "business": "in a sleek corporate setting, polished professional lighting",
    "date": "at an intimate candlelit restaurant on a date night, warm mood lighting",
    "dinner": "at an upscale restaurant in the evening, warm ambient light",
    "cocktail": "at a chic rooftop cocktail party at night, city lights bokeh",
    "evening": "at an elegant evening event, moody dramatic lighting",
    "party": "at a lively party with warm colorful lighting",
    "brunch": "at a sunny garden brunch, bright airy daylight",
    "casual": "on a relaxed city street in soft daylight",
    "weekend": "on a casual weekend outing, natural daylight",
    "gym": "in a modern fitness studio, bright clean light",
    "sport": "in an athletic outdoor setting, bright natural light",
    "beach": "on a sunny beach with soft ocean light",
    "vacation": "on a scenic vacation backdrop, bright golden light",
}


def _scene_for_occasion(occasion: Optional[str], user_text: str) -> Optional[str]:
    """Best-effort try-on background for a detected occasion (None -> Studio default)."""
    if occasion and occasion in _OCCASION_SCENE:
        return _OCCASION_SCENE[occasion]
    t = (user_text or "").lower()
    for key, scene in _OCCASION_SCENE.items():
        if key in t:
            return scene
    return None


SYSTEM_TEMPLATE = """You are Aria, StyleSense's personal stylist. Warm, specific, honest, concise.

# USER'S REVEALED PREFERENCES (from this-or-that choices — prioritise these when styling)
{preferences}

# HOW TO PICK THE BEST OUTFIT (reason before you reply)
1. Read the user's EXACT request - the occasion/dress code, vibe, a specific item they named, or a
   constraint (weather, color). Anchor everything to what they actually asked.
2. SCAN the wardrobe SECTIONS below (grouped by category). Build the single BEST complete outfit FROM
   WHAT THEY OWN: pick ONE top + ONE bottom (or ONE dress), then add outerwear / shoes / one accessory
   only when they improve the look. Choose the items that best match the request, not the first ones.
3. Refine with the STYLE PROFILE: among suitable pieces, prefer their flattering colors and silhouettes
   for their body type, and say one reason WHY a piece works for them.
4. VARY BY OCCASION - a formal dinner, a beach day and the gym must get clearly different outfits; never
   default to the same hero piece. If one item fits several occasions, restyle it (layers/tuck/shoes).
5. GAPS: if the wardrobe genuinely can't cover the request, still build the closest outfit from what they
   own, THEN name the specific garment TYPE to add (e.g. "a tailored rust blazer") with one reason.

# RULES
- Only recommend REAL items from the wardrobe, by their exact name, with the tag AFTER the name:
  "the Cream sweatshirt [ITEM:abc-123]". Never invent items or IDs; only tag wardrobe items.
- If body type is "unknown", give solid general advice + gently suggest a full-body photo in Avatar
  Setup. If the wardrobe is empty, name the key starter pieces. If you can't know something (weather), say so.

# FORMAT (Markdown)
- One short intro line, then a bulleted outfit list (ONE piece per bullet, newest-first is fine), then
  ONE short styling tip. Bold ONLY the item name like **Name** (the tag goes right after). Under ~120 words.

# USER'S STYLE PROFILE
{color_profile}

# STYLING KNOWLEDGE (research-grounded reference - apply, don't quote)
{kb}

# USER'S WARDROBE (grouped by category; build the outfit slot by slot)
{wardrobe}
"""


def _ensure_profile(state: AriaState) -> dict:
    user = supabase_service.get_user(state["user_id"]) or {}
    result: dict = {}

    if not state.get("color_profile"):
        cached = user.get("color_profile")
        if cached:
            result["color_profile"] = cached
        else:
            selfie = color_service.best_profile_source(user)
            if selfie:
                profile = color_service.analyze_color_profile(selfie)
                if profile:
                    try:
                        supabase_service.upsert_user(
                            state["user_id"], color_profile=profile, color_profile_source_selfie=selfie
                        )
                    except Exception as e:
                        logger.warning(f"Could not cache color profile: {e}")
                    result["color_profile"] = profile

    # Load this-or-that style preferences (last 10)
    prefs = user.get("style_preferences") or []
    if prefs:
        result["style_preferences"] = prefs[-10:]

    return result


def _last_user_text(messages: list) -> str:
    for m in reversed(messages or []):
        if m.get("role") == "user":
            content = m.get("content", "")
            if isinstance(content, list):
                return " ".join(b.get("text", "") for b in content if b.get("type") == "text")
            return content or ""
    return ""


def _detect_occasion(state: AriaState) -> dict:
    text = _last_user_text(state.get("messages", []))
    occasion = style_kb.detect_occasion(text)
    return {"occasion": occasion, "scene": _scene_for_occasion(occasion, text)}


def _retrieve_kb(state: AriaState) -> dict:
    snippets = style_kb.retrieve(
        query=_last_user_text(state.get("messages", [])),
        color_profile=state.get("color_profile"),
        occasion=state.get("occasion"),
    )
    return {"kb_snippets": snippets}


def _format_preferences(prefs: list, wardrobe: list) -> str:
    """Translate raw this-or-that records into readable sentences for Aria."""
    if not prefs:
        return "(no this-or-that choices yet — recommend based on wardrobe and color profile only)"
    item_map = {w["id"]: w["name"] for w in (wardrobe or []) if w.get("id") and w.get("name")}
    lines = []
    for p in prefs:
        chosen = p.get("chosen_id", "")
        rejected = p.get("b_id") if chosen == p.get("a_id") else p.get("a_id")
        cn = item_map.get(chosen, p.get("chosen_type") or chosen[:8])
        rn = item_map.get(rejected or "", p.get("rejected_type") or (rejected or "")[:8])
        if cn and rn:
            lines.append(f"- Preferred {cn!r} over {rn!r}")
        elif cn:
            lines.append(f"- Chose style/archetype: {cn!r}")
    return "\n".join(lines) if lines else "(no interpretable preferences yet)"


def _advise(state: AriaState) -> dict:
    system = SYSTEM_TEMPLATE.format(
        preferences=_format_preferences(state.get("style_preferences", []), state.get("wardrobe", [])),
        color_profile=color_service.format_color_profile(state.get("color_profile")),
        kb="\n".join(f"- {s}" for s in state.get("kb_snippets", [])) or "(none)",
        wardrobe=anthropic_service._format_wardrobe(state.get("wardrobe", [])),
    )
    msgs = [
        {"role": m["role"], "content": m["content"]}
        for m in state.get("messages", [])
        if m.get("role") in ("user", "assistant")
    ]
    if not msgs or msgs[-1]["role"] != "user":
        raise ValueError("Last message must be from the user.")

    # Stronger reasoning model for outfit decisions (falls back to Haiku if unavailable).
    try:
        resp = anthropic_service.client.messages.create(
            model=ADVISE_MODEL, max_tokens=600, temperature=0.7, system=system, messages=msgs,
        )
    except Exception as e:
        logger.warning(f"advise model {ADVISE_MODEL} failed ({e}); falling back to {anthropic_service.MODEL}")
        resp = anthropic_service.client.messages.create(
            model=anthropic_service.MODEL, max_tokens=600, temperature=0.7, system=system, messages=msgs,
        )
    reply = "".join(b.text for b in resp.content if hasattr(b, "text")).strip()
    return {"reply": reply, "item_ids": anthropic_service.extract_item_ids(reply)}


def _build():
    g = StateGraph(AriaState)
    g.add_node("ensure_profile", _ensure_profile)
    g.add_node("detect_occasion", _detect_occasion)
    g.add_node("retrieve_kb", _retrieve_kb)
    g.add_node("advise", _advise)
    g.add_edge(START, "ensure_profile")
    g.add_edge("ensure_profile", "detect_occasion")
    g.add_edge("detect_occasion", "retrieve_kb")
    g.add_edge("retrieve_kb", "advise")
    g.add_edge("advise", END)
    return g.compile()


_graph = _build()


def run_aria(user_id: str, messages: list, wardrobe: list) -> dict:
    """Invoke the Aria graph. Returns {reply, item_ids, color_profile, occasion}."""
    out = _graph.invoke({"user_id": user_id, "messages": messages, "wardrobe": wardrobe})
    return {
        "reply": out.get("reply", ""),
        "item_ids": out.get("item_ids", []),
        "color_profile": out.get("color_profile"),
        "occasion": out.get("occasion"),
        "scene": out.get("scene"),
    }
