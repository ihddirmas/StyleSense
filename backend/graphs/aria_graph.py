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
import asyncio
import json
import os
import logging
from typing import Optional, TypedDict

from langgraph.graph import StateGraph, START, END

from services import supabase_service, anthropic_service, style_kb, color_service, kibbe_service, aria_tools, usage_limits

logger = logging.getLogger(__name__)

# Stronger model for the actual outfit reasoning (Haiku is the fast fallback).
ADVISE_MODEL = os.getenv("ARIA_ADVISE_MODEL", "claude-sonnet-4-6")


class AriaState(TypedDict, total=False):
    user_id: str
    messages: list           # [{role, content}]
    wardrobe: list
    color_profile: Optional[dict]
    kibbe_analysis: Optional[dict]
    occasion: Optional[str]
    scene: Optional[str]
    kb_snippets: list
    style_preferences: list  # from this-or-that choices
    reply: str
    item_ids: list
    pending_photo_url: Optional[str]  # permanent URL of a photo shared this turn, if any
    avatar_selfie_url: Optional[str]  # best face photo for a try-on generation, if any
    pending_action: Optional[dict]    # tool call Aria proposed but hasn't executed
    product_preview: Optional[dict]   # result of an auto-executed lookup_product_from_url call


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
Your job is **personal style intelligence**: tell users what flatters them and why — grounded in
their color season, undertone, and Kibbe type — for clothes they OWN or paste as a URL.

# USER'S REVEALED PREFERENCES (from this-or-that choices — prioritise these when styling)
{preferences}

# VERDICT MODE (when user asks about a specific item, URL, or "does this suit me")
1. Lead with a clear verdict: **Suits you** | **Borderline** | **Avoid** (one line).
2. Explain WHY using their profile: cite undertone vs garment warmth/coolness, contrast, Kibbe lines.
   Example: "This warm coral clashes with your cool undertone (Summer) — try dusty rose instead."
3. If color or Kibbe confidence is below ~70%, say "medium confidence — take with a grain of salt"
   and suggest better lighting or a full-body photo in Settings.
4. Only then suggest alternatives from wardrobe or what to shop for.
5. Try-on is optional proof — offer only after the verdict if they want to see it.

# OUTFIT MODE (when user asks what to wear / occasion styling)
1. Read their EXACT request — occasion, vibe, constraints.
2. Build ONE complete outfit FROM THEIR WARDROBE using [ITEM:<id>] tags after each name.
3. Say WHY each piece works for their season + Kibbe (one reason per outfit, not per bullet).
4. Vary by occasion — never default to the same hero piece.

# RULES
- Only recommend REAL wardrobe items with exact names: "the Cream sweatshirt [ITEM:abc-123]".
- Never invent items or IDs.
- If wardrobe is empty, still give color/Kibbe guidance for pasted URLs or described items.

# FORMAT (Markdown)
- Verdict/outfit mode: short intro, bullets if listing pieces, one styling tip. Under ~120 words unless URL analysis needs more.
- Bold item names like **Name** with [ITEM:id] immediately after.

# AGENT ACTIONS (tools — user must confirm anything that spends credits)
- **add_wardrobe_items** — photo shared THIS turn + user wants to save garment(s).
- **generate_tryon** — only AFTER a verdict/outfit with [ITEM:<id>] tags in this same reply (proof step).
- **lookup_product_from_url** — store URL pasted; runs automatically.

Never propose add_wardrobe_items without a photo. Never propose generate_tryon before tagging items.

# USER'S STYLE PROFILE (color / season)
- **add_wardrobe_items** — only when the user shared a photo THIS turn and wants to save garment(s) from it.
- **generate_tryon** — only after you've recommended specific items using [ITEM:<id>] tags in this same reply.
- **lookup_product_from_url** — when the user pastes a store URL; runs automatically (no confirmation).

Never propose add_wardrobe_items without a photo in this turn. Never propose generate_tryon before tagging items.
If the user asks you to try something on, recommend the outfit first, then propose generate_tryon.

# USER'S STYLE PROFILE
{color_profile}

# KIBBE BODY TYPE PROFILE
{kibbe_profile}

# STYLING KNOWLEDGE (research-grounded reference - apply, don't quote)
{kb}

# USER'S WARDROBE (grouped by category)
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

    if not state.get("kibbe_analysis"):
        cached = user.get("kibbe_analysis")
        if cached:
            result["kibbe_analysis"] = cached
        else:
            full_body = (user.get("full_body_url") or "").strip()
            if full_body:
                analysis = kibbe_service.analyze_kibbe_type(full_body)
                if analysis:
                    try:
                        supabase_service.upsert_user(
                            state["user_id"],
                            kibbe_type=analysis.get("kibbe_type"),
                            kibbe_analysis=analysis,
                            kibbe_source_photo=full_body,
                        )
                    except Exception as e:
                        logger.warning(f"Could not cache Kibbe analysis: {e}")
                    result["kibbe_analysis"] = analysis

    # Load this-or-that style preferences (last 10)
    prefs = user.get("style_preferences") or []
    if prefs:
        result["style_preferences"] = prefs[-10:]

    result["avatar_selfie_url"] = color_service.best_face_source(user)

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
    kibbe_analysis = state.get("kibbe_analysis") or {}
    kibbe_type = kibbe_analysis.get("kibbe_type") if isinstance(kibbe_analysis, dict) else None
    snippets = style_kb.retrieve(
        query=_last_user_text(state.get("messages", [])),
        color_profile=state.get("color_profile"),
        occasion=state.get("occasion"),
        kibbe_type=kibbe_type,
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


# Bounds the read-only tool loop below (lookup_product_from_url) so a confused
# model can't loop indefinitely -- each round is one more Anthropic call.
MAX_TOOL_ROUNDS = 3


def _advise(state: AriaState) -> dict:
    system = SYSTEM_TEMPLATE.format(
        preferences=_format_preferences(state.get("style_preferences", []), state.get("wardrobe", [])),
        color_profile=color_service.format_color_profile(state.get("color_profile")),
        kibbe_profile=kibbe_service.format_kibbe_profile(state.get("kibbe_analysis")),
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

    def _call(messages: list):
        # Stronger reasoning model for outfit decisions (falls back to Haiku if unavailable).
        kwargs = dict(
            max_tokens=600, temperature=0.7, system=system, messages=messages,
            tools=aria_tools.ANTHROPIC_TOOLS, tool_choice={"type": "auto"},
        )
        try:
            return anthropic_service.client.messages.create(model=ADVISE_MODEL, **kwargs)
        except Exception as e:
            logger.warning(f"advise model {ADVISE_MODEL} failed ({e}); falling back to {anthropic_service.MODEL}")
            return anthropic_service.client.messages.create(model=anthropic_service.MODEL, **kwargs)

    product_preview = None
    resp = _call(msgs)
    rounds = 1
    while resp.stop_reason == "tool_use" and rounds < MAX_TOOL_ROUNDS:
        tool_use = next((b for b in resp.content if getattr(b, "type", None) == "tool_use"), None)
        if tool_use is None or tool_use.name not in aria_tools.READONLY_TOOLS:
            break
        validated = aria_tools.validate_tool_input(tool_use.name, tool_use.input, state.get("wardrobe", []))
        if validated is None:
            break
        tool_result = asyncio.run(aria_tools.execute_readonly_tool(tool_use.name, validated))
        if "error" not in tool_result:
            product_preview = tool_result
        msgs = msgs + [
            {"role": "assistant", "content": resp.content},
            {"role": "user", "content": [
                {"type": "tool_result", "tool_use_id": tool_use.id, "content": json.dumps(tool_result)},
            ]},
        ]
        resp = _call(msgs)
        rounds += 1

    reply = "".join(b.text for b in resp.content if hasattr(b, "text")).strip()
    result: dict = {
        "reply": reply,
        "item_ids": anthropic_service.extract_item_ids(reply),
        "product_preview": product_preview,
    }

    if resp.stop_reason == "tool_use":
        tool_use = next((b for b in resp.content if getattr(b, "type", None) == "tool_use"), None)
        if tool_use is not None and tool_use.name in aria_tools.CONFIRM_REQUIRED_TOOLS:
            validated = aria_tools.validate_tool_input(tool_use.name, tool_use.input, state.get("wardrobe", []))
            ctx = {
                "pending_photo_url": state.get("pending_photo_url"),
                "avatar_selfie_url": state.get("avatar_selfie_url"),
                "wardrobe": state.get("wardrobe", []),
            }
            capped = tool_use.name == "generate_tryon" and usage_limits.tryon_capped(state["user_id"])
            if capped:
                note = usage_limits.tryon_cap_message()
            else:
                pending = validated and aria_tools.build_pending_action(tool_use.name, validated, ctx)
                if pending:
                    result["pending_action"] = {**pending, "tool_use_id": tool_use.id}
                    note = None
                else:
                    note = aria_tools.explain_blocked_proposal(
                        tool_use.name, validated, ctx, state["user_id"]
                    )
            if note:
                result["reply"] = f"{reply}\n\n{note}".strip() if reply else note

    return result


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


def run_aria(
    user_id: str, messages: list, wardrobe: list, pending_photo_url: Optional[str] = None
) -> dict:
    """Invoke the Aria graph. Returns {reply, item_ids, color_profile, occasion,
    kibbe_analysis, pending_action, product_preview}."""
    out = _graph.invoke({
        "user_id": user_id,
        "messages": messages,
        "wardrobe": wardrobe,
        "pending_photo_url": pending_photo_url,
    })
    return {
        "reply": out.get("reply", ""),
        "item_ids": out.get("item_ids", []),
        "color_profile": out.get("color_profile"),
        "occasion": out.get("occasion"),
        "scene": out.get("scene"),
        "kibbe_analysis": out.get("kibbe_analysis"),
        "pending_action": out.get("pending_action"),
        "product_preview": out.get("product_preview"),
    }
