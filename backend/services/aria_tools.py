"""Tool-calling surface for the Aria stylist agent (Anthropic `tools=[...]`).

Every tool here spends Runway credits and/or mutates data, so it is confirm-gated:
`_advise` in aria_graph.py stops the moment one is proposed and returns a
`pending_action` instead of executing it. The frontend renders that as a card the
user must explicitly confirm before `execute_confirmed_tool` runs.
"""
from typing import Optional

VALID_CATEGORIES = {"tops", "bottoms", "dresses", "outerwear", "shoes", "accessories"}
VALID_OCCASIONS = {"casual", "formal", "evening", "sport", "beach", "any"}

ANTHROPIC_TOOLS = [
    {
        "name": "add_wardrobe_items",
        "description": (
            "Add one or more clothing items the user just shared a photo of to their "
            "StyleSense wardrobe. This SPENDS Runway credits (isolates each item as a clean "
            "product photo) and writes to the database, so it always requires the user's "
            "explicit confirmation before it runs -- you are only proposing it. Only call "
            "this when the user shared a photo in this turn and wants to save item(s) from it."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "items": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 6,
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string", "description": "e.g. 'Cream ribbed sweater'"},
                            "category": {"type": "string", "enum": sorted(VALID_CATEGORIES)},
                            "color": {"type": "string"},
                            "brand": {"type": "string"},
                            "occasion": {"type": "string", "enum": sorted(VALID_OCCASIONS)},
                            "position": {
                                "type": "string",
                                "description": "Where in the photo, e.g. 'top left' -- used to isolate just this garment.",
                            },
                        },
                        "required": ["name", "category"],
                    },
                }
            },
            "required": ["items"],
        },
    },
    {
        "name": "generate_tryon",
        "description": (
            "Generate a photorealistic try-on image of the user wearing specific wardrobe "
            "items on their avatar. SPENDS Runway credits and counts against the user's "
            "monthly try-on limit, so it always requires the user's explicit confirmation "
            "before it runs -- you are only proposing it. Only call this after you've "
            "already recommended the same items by [ITEM:<id>] tag in your reply text."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "item_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "minItems": 1,
                    "maxItems": 6,
                    "description": "Wardrobe item IDs matching the [ITEM:<id>] tags you just used.",
                },
                "scene": {
                    "type": "string",
                    "description": "Optional background, e.g. 'at a beach wedding at golden hour'. Omit for the Studio default.",
                },
            },
            "required": ["item_ids"],
        },
    },
    {
        "name": "lookup_product_from_url",
        "description": (
            "Fetch a product's image and name from a URL the user pasted (an online "
            "store product page or a direct image link). Free, read-only, saves "
            "nothing -- runs immediately, no confirmation needed. Use it when the user "
            "shares a link and asks about it or wants styling advice on it."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "The product page or image URL the user pasted."},
            },
            "required": ["url"],
        },
    },
    {
        "name": "search_wardrobe",
        "description": (
            "Filter the user's wardrobe by category, color, occasion, or free-text query. "
            "Free, read-only, runs immediately. Use when the closet is large or the user "
            "asks for a specific type of piece before you recommend an outfit."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Free-text match against name/color/brand, e.g. 'linen', 'navy'.",
                },
                "category": {
                    "type": "string",
                    "enum": sorted(VALID_CATEGORIES),
                },
                "color": {"type": "string"},
                "occasion": {
                    "type": "string",
                    "enum": sorted(VALID_OCCASIONS),
                },
                "limit": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 12,
                    "description": "Max matches to return (default 8).",
                },
            },
        },
    },
    {
        "name": "save_outfit",
        "description": (
            "Save a named outfit made of wardrobe items the user liked (optionally with a "
            "try-on preview URL). Free (no Runway credits) but writes to the database, so "
            "it always requires explicit confirmation. Call after the user asks to save a look."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Short outfit name, e.g. 'Beach wedding guest'."},
                "item_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "minItems": 1,
                    "maxItems": 8,
                },
                "occasion": {"type": "string"},
                "preview_image_url": {
                    "type": "string",
                    "description": "Optional try-on image URL to attach as the outfit cover.",
                },
                "notes": {"type": "string"},
            },
            "required": ["name", "item_ids"],
        },
    },
]

CONFIRM_REQUIRED_TOOLS = {"add_wardrobe_items", "generate_tryon", "save_outfit"}
READONLY_TOOLS = {"lookup_product_from_url", "search_wardrobe"}


def _clean_item(raw: dict) -> Optional[dict]:
    if not isinstance(raw, dict):
        return None
    name = (raw.get("name") or "").strip()
    category = (raw.get("category") or "").strip().lower()
    if not name or category not in VALID_CATEGORIES:
        return None
    occasion = raw.get("occasion")
    if occasion not in VALID_OCCASIONS:
        occasion = "casual"
    return {
        "name": name,
        "category": category,
        "color": raw.get("color"),
        "brand": raw.get("brand"),
        "occasion": occasion,
        "position": raw.get("position"),
    }


def _validate_add_wardrobe_items(raw_input: dict) -> Optional[dict]:
    raw_items = (raw_input or {}).get("items")
    if not isinstance(raw_items, list):
        return None
    cleaned = [c for it in raw_items if (c := _clean_item(it)) is not None]
    if not cleaned:
        return None
    return {"items": cleaned[:6]}


def _validate_generate_tryon(raw_input: dict, wardrobe: list) -> Optional[dict]:
    item_ids = (raw_input or {}).get("item_ids")
    if not isinstance(item_ids, list):
        return None
    wardrobe_ids = {w["id"] for w in (wardrobe or []) if w.get("id")}
    valid_ids = [i for i in item_ids if isinstance(i, str) and i in wardrobe_ids]
    if not valid_ids:
        return None
    scene = (raw_input or {}).get("scene")
    return {"item_ids": valid_ids[:6], "scene": scene if isinstance(scene, str) and scene.strip() else None}


def _validate_lookup_product(raw_input: dict) -> Optional[dict]:
    url = (raw_input or {}).get("url")
    if not isinstance(url, str) or not url.strip():
        return None
    return {"url": url.strip()}


def _validate_search_wardrobe(raw_input: dict) -> Optional[dict]:
    raw = raw_input or {}
    out: dict = {}
    query = raw.get("query")
    if isinstance(query, str) and query.strip():
        out["query"] = query.strip().lower()
    category = (raw.get("category") or "").strip().lower()
    if category in VALID_CATEGORIES:
        out["category"] = category
    color = raw.get("color")
    if isinstance(color, str) and color.strip():
        out["color"] = color.strip().lower()
    occasion = (raw.get("occasion") or "").strip().lower()
    if occasion in VALID_OCCASIONS:
        out["occasion"] = occasion
    limit = raw.get("limit", 8)
    try:
        limit_i = int(limit)
    except (TypeError, ValueError):
        limit_i = 8
    out["limit"] = max(1, min(12, limit_i))
    # Need at least one filter or a query; bare search of whole closet is ok with empty filters
    return out


def _validate_save_outfit(raw_input: dict, wardrobe: list) -> Optional[dict]:
    raw = raw_input or {}
    name = (raw.get("name") or "").strip()
    if not name:
        return None
    item_ids = raw.get("item_ids")
    if not isinstance(item_ids, list):
        return None
    wardrobe_ids = {w["id"] for w in (wardrobe or []) if w.get("id")}
    valid_ids = [i for i in item_ids if isinstance(i, str) and i in wardrobe_ids]
    if not valid_ids:
        return None
    preview = raw.get("preview_image_url")
    notes = raw.get("notes")
    occasion = raw.get("occasion")
    return {
        "name": name[:80],
        "item_ids": valid_ids[:8],
        "occasion": occasion.strip() if isinstance(occasion, str) and occasion.strip() else None,
        "preview_image_url": preview.strip() if isinstance(preview, str) and preview.strip() else None,
        "notes": notes.strip() if isinstance(notes, str) and notes.strip() else None,
    }


def validate_tool_input(name: str, raw_input: dict, wardrobe: list) -> Optional[dict]:
    """Re-validate Claude's tool_use input server-side before it's ever shown to the
    user (confirm-required tools) or executed (read-only tools). Returns a cleaned
    dict, or None if the call should be silently dropped."""
    if name == "add_wardrobe_items":
        return _validate_add_wardrobe_items(raw_input)
    if name == "generate_tryon":
        return _validate_generate_tryon(raw_input, wardrobe)
    if name == "lookup_product_from_url":
        return _validate_lookup_product(raw_input)
    if name == "search_wardrobe":
        return _validate_search_wardrobe(raw_input)
    if name == "save_outfit":
        return _validate_save_outfit(raw_input, wardrobe)
    return None


def _build_add_wardrobe_items_action(validated_input: dict, ctx: dict) -> Optional[dict]:
    photo_url = ctx.get("pending_photo_url")
    if not photo_url:
        return None
    items = validated_input["items"]
    names = ", ".join(it["name"] for it in items)
    return {
        "tool_name": "add_wardrobe_items",
        "tool_input": {"source_image_url": photo_url, "items": items},
        "summary": f"Add {names} to your wardrobe?",
        "cost_credits": 2 * len(items),
    }


def _build_generate_tryon_action(validated_input: dict, ctx: dict) -> Optional[dict]:
    avatar_selfie_url = ctx.get("avatar_selfie_url")
    if not avatar_selfie_url:
        return None
    wardrobe = ctx.get("wardrobe") or []
    picked = [w for w in wardrobe if w.get("id") in validated_input["item_ids"]]
    if not picked:
        return None
    names = ", ".join(w["name"] for w in picked)
    return {
        "tool_name": "generate_tryon",
        "tool_input": {
            "avatar_selfie_url": avatar_selfie_url,
            "items": [{"image_url": w["image_url"], "name": w["name"], "category": w["category"]} for w in picked],
            "scene": validated_input.get("scene"),
        },
        "summary": f"Generate a try-on with {names}?",
        "cost_credits": 5,
    }


def _build_save_outfit_action(validated_input: dict, ctx: dict) -> Optional[dict]:
    wardrobe = ctx.get("wardrobe") or []
    picked = [w for w in wardrobe if w.get("id") in validated_input["item_ids"]]
    if not picked:
        return None
    names = ", ".join(w["name"] for w in picked)
    return {
        "tool_name": "save_outfit",
        "tool_input": validated_input,
        "summary": f'Save outfit "{validated_input["name"]}" ({names})?',
        "cost_credits": 0,
    }


def build_pending_action(name: str, validated_input: dict, ctx: dict) -> Optional[dict]:
    """Inject server-known context (photo URL, avatar selfie) and produce the
    human-readable summary + credit cost the frontend shows on the confirm card."""
    if name == "add_wardrobe_items":
        return _build_add_wardrobe_items_action(validated_input, ctx)
    if name == "generate_tryon":
        return _build_generate_tryon_action(validated_input, ctx)
    if name == "save_outfit":
        return _build_save_outfit_action(validated_input, ctx)
    return None


def explain_blocked_proposal(
    name: str,
    validated_input: Optional[dict],
    ctx: dict,
    user_id: str,
) -> Optional[str]:
    """Plain-language note when the model requested a confirm tool we cannot propose."""
    del user_id  # reserved for future per-user messaging
    if name not in CONFIRM_REQUIRED_TOOLS:
        return None
    if not validated_input:
        return None
    if build_pending_action(name, validated_input, ctx):
        return None
    if name == "add_wardrobe_items" and not ctx.get("pending_photo_url"):
        return "Attach a photo in this message if you'd like me to save items to your wardrobe."
    if name == "generate_tryon" and not ctx.get("avatar_selfie_url"):
        return "Add a selfie in Settings and I can generate try-ons for you."
    return None


async def _execute_add_wardrobe_items(tool_input: dict, user_id: str) -> dict:
    from models.schemas import DetectedItem
    from services.wardrobe_add_service import confirm_and_add_items

    items = [DetectedItem(**it) for it in tool_input["items"]]
    created, failed, summary = await confirm_and_add_items(
        user_id=user_id,
        source_image_url=tool_input["source_image_url"],
        items=items,
    )
    return {
        "summary": f"Added {summary} to your wardrobe.",
        "created": created,
        "failed": failed,
    }


async def _execute_generate_tryon(tool_input: dict, user_id: str) -> dict:
    from fastapi import HTTPException
    from services import tryon_service

    try:
        result = await tryon_service.run_multi_tryon(
            user_id=user_id,
            avatar_selfie_url=tool_input["avatar_selfie_url"],
            items=tool_input["items"],
            setting=tool_input.get("scene"),
        )
    except HTTPException as e:
        if e.status_code == 402:
            return {"summary": str(e.detail), "created": [], "failed": []}
        raise

    return {
        "summary": "Here's your try-on!",
        "created": [],
        "failed": [],
        "result_image_url": result["result_image_url"],
        "result_id": result["result_id"],
    }


async def _execute_save_outfit(tool_input: dict, user_id: str) -> dict:
    from services import supabase_service

    outfit = supabase_service.save_outfit(
        user_id=user_id,
        name=tool_input["name"],
        item_ids=tool_input["item_ids"],
        occasion=tool_input.get("occasion"),
        preview_image_url=tool_input.get("preview_image_url"),
        notes=tool_input.get("notes"),
    )
    return {
        "summary": f'Saved outfit "{tool_input["name"]}".',
        "created": [outfit],
        "failed": [],
        "outfit_id": outfit.get("id") if isinstance(outfit, dict) else None,
    }


def _search_wardrobe_items(tool_input: dict, wardrobe: list) -> dict:
    query = tool_input.get("query") or ""
    category = tool_input.get("category")
    color = tool_input.get("color") or ""
    occasion = tool_input.get("occasion")
    limit = tool_input.get("limit") or 8

    matches = []
    for w in wardrobe or []:
        if category and (w.get("category") or "").lower() != category:
            continue
        if occasion and occasion != "any":
            w_occ = (w.get("occasion") or "").lower()
            if w_occ and w_occ != occasion and occasion not in w_occ:
                continue
        blob = " ".join(
            str(w.get(k) or "") for k in ("name", "color", "brand", "category", "occasion")
        ).lower()
        if query and query not in blob:
            continue
        if color and color not in (w.get("color") or "").lower() and color not in blob:
            continue
        matches.append({
            "id": w.get("id"),
            "name": w.get("name"),
            "category": w.get("category"),
            "color": w.get("color"),
            "occasion": w.get("occasion"),
            "brand": w.get("brand"),
        })
        if len(matches) >= limit:
            break
    return {"count": len(matches), "items": matches}


async def execute_confirmed_tool(name: str, tool_input: dict, user_id: str) -> dict:
    """Execute a user-confirmed tool call via the same service the manual UI uses."""
    if name == "add_wardrobe_items":
        return await _execute_add_wardrobe_items(tool_input, user_id)
    if name == "generate_tryon":
        return await _execute_generate_tryon(tool_input, user_id)
    if name == "save_outfit":
        return await _execute_save_outfit(tool_input, user_id)
    raise ValueError(f"Unknown or not-yet-supported tool: {name}")


async def execute_readonly_tool(name: str, tool_input: dict, wardrobe: Optional[list] = None) -> dict:
    """Execute a read-only tool immediately, inside the tool-use loop in
    aria_graph._advise -- it costs nothing and mutates nothing, so unlike
    CONFIRM_REQUIRED_TOOLS it never needs a user confirmation round-trip."""
    if name == "lookup_product_from_url":
        from services.scrape_service import scrape_product

        try:
            result = await scrape_product(tool_input["url"])
        except Exception as e:
            return {"error": f"Could not fetch that URL: {e}"}
        return {
            "image_url": result.image_url,
            "name": result.name,
            "source_url": result.source_url,
            "suggested_category": result.suggested_category,
        }
    if name == "search_wardrobe":
        return _search_wardrobe_items(tool_input, wardrobe or [])
    raise ValueError(f"Unknown or not-yet-supported read-only tool: {name}")
