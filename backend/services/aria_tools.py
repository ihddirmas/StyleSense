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
        "name": "list_wardrobe_gaps",
        "description": (
            "Analyze the user's OWNED wardrobe for missing categories before a trip or "
            "occasion. Free, read-only, runs immediately. Call when they ask what's "
            "missing, what to pack, or gap analysis for work travel."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "dress_code": {
                    "type": "string",
                    "enum": ["business", "smart casual", "casual", "formal", "beach", "evening"],
                    "description": "Dress code for the trip or event.",
                },
                "days": {"type": "integer", "minimum": 1, "maximum": 14, "description": "Trip length in days."},
            },
            "required": ["dress_code"],
        },
    },
    {
        "name": "plan_trip_capsule",
        "description": (
            "Build a multi-day capsule wardrobe plan from items the user ALREADY OWNS — "
            "day-by-day outfits, packing notes, and shopping gaps. Free, read-only. "
            "Use for work trips, vacations, or 'capsule wardrobe for N days in {city}'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "destination": {"type": "string", "description": "City or destination, e.g. 'Milan'."},
                "days": {"type": "integer", "minimum": 1, "maximum": 14},
                "dress_code": {
                    "type": "string",
                    "enum": ["business", "smart casual", "casual", "formal", "beach", "evening"],
                },
                "climate_notes": {
                    "type": "string",
                    "description": "Optional weather/context, e.g. 'hot and humid, 32C'.",
                },
            },
            "required": ["destination", "days", "dress_code"],
        },
    },
]

CONFIRM_REQUIRED_TOOLS = {"add_wardrobe_items", "generate_tryon"}
READONLY_TOOLS = {"lookup_product_from_url", "list_wardrobe_gaps", "plan_trip_capsule"}

_DRESS_CODES = {"business", "smart casual", "casual", "formal", "beach", "evening"}


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


def _validate_list_gaps(raw_input: dict) -> Optional[dict]:
    dress = (raw_input or {}).get("dress_code") or "business"
    dress = str(dress).strip().lower()
    if dress not in _DRESS_CODES:
        dress = "business"
    days = (raw_input or {}).get("days", 5)
    try:
        days = int(days)
    except (TypeError, ValueError):
        days = 5
    return {"dress_code": dress, "days": max(1, min(days, 14))}


def _validate_plan_capsule(raw_input: dict) -> Optional[dict]:
    dest = (raw_input or {}).get("destination")
    if not isinstance(dest, str) or not dest.strip():
        return None
    days = (raw_input or {}).get("days")
    try:
        days = int(days)
    except (TypeError, ValueError):
        return None
    dress = (raw_input or {}).get("dress_code") or "business"
    dress = str(dress).strip().lower()
    if dress not in _DRESS_CODES:
        dress = "business"
    climate = (raw_input or {}).get("climate_notes")
    return {
        "destination": dest.strip()[:120],
        "days": max(1, min(days, 14)),
        "dress_code": dress,
        "climate_notes": climate.strip()[:200] if isinstance(climate, str) and climate.strip() else None,
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
    if name == "list_wardrobe_gaps":
        return _validate_list_gaps(raw_input)
    if name == "plan_trip_capsule":
        return _validate_plan_capsule(raw_input)
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


def build_pending_action(name: str, validated_input: dict, ctx: dict) -> Optional[dict]:
    """Inject server-known context (photo URL, avatar selfie) and produce the
    human-readable summary + credit cost the frontend shows on the confirm card."""
    if name == "add_wardrobe_items":
        return _build_add_wardrobe_items_action(validated_input, ctx)
    if name == "generate_tryon":
        return _build_generate_tryon_action(validated_input, ctx)
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


async def execute_confirmed_tool(name: str, tool_input: dict, user_id: str) -> dict:
    """Execute a user-confirmed tool call via the same service the manual UI uses."""
    if name == "add_wardrobe_items":
        return await _execute_add_wardrobe_items(tool_input, user_id)
    if name == "generate_tryon":
        return await _execute_generate_tryon(tool_input, user_id)
    raise ValueError(f"Unknown or not-yet-supported tool: {name}")


async def execute_readonly_tool(name: str, tool_input: dict, ctx: Optional[dict] = None) -> dict:
    """Execute a read-only tool immediately, inside the tool-use loop in
    aria_graph._advise -- it costs nothing and mutates nothing."""
    ctx = ctx or {}

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

    if name == "list_wardrobe_gaps":
        from services import capsule_service

        return capsule_service.list_wardrobe_gaps(
            ctx.get("wardrobe") or [],
            dress_code=tool_input["dress_code"],
            days=tool_input.get("days", 5),
            color_profile=ctx.get("color_profile"),
            kibbe_analysis=ctx.get("kibbe_analysis"),
        )

    if name == "plan_trip_capsule":
        from services import capsule_service

        plan = capsule_service.plan_trip_capsule(
            ctx.get("wardrobe") or [],
            destination=tool_input["destination"],
            days=tool_input["days"],
            dress_code=tool_input["dress_code"],
            climate_notes=tool_input.get("climate_notes"),
            color_profile=ctx.get("color_profile"),
            kibbe_analysis=ctx.get("kibbe_analysis"),
        )
        return {"capsule_plan": plan, **plan}

    raise ValueError(f"Unknown or not-yet-supported read-only tool: {name}")
