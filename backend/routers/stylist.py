"""Anthropic-powered stylist chat (Aria LangGraph agent)."""
import asyncio
import random
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from models.schemas import StylistChatRequest, StylistChatResponse
from services import supabase_service, anthropic_service, color_service
from services.auth_service import current_user
from graphs import aria_graph

router = APIRouter()
_executor = ThreadPoolExecutor(max_workers=4)


async def _run_blocking(fn, *args, **kwargs):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, lambda: fn(*args, **kwargs))


@router.post("/chat", response_model=StylistChatResponse)
async def chat(req: StylistChatRequest, user = Depends(current_user)):
    if not req.messages:
        raise HTTPException(400, "Need at least one message.")

    wardrobe = supabase_service.get_wardrobe_items(user["id"])
    messages = [m.model_dump() for m in req.messages]

    if req.image_url:
        if req.image_url.startswith("data:"):
            # Embed directly as a vision block — Aria (Sonnet) sees the raw image.
            header, b64 = req.image_url.split(",", 1)
            media = header.split(":")[1].split(";")[0]
            print(f"[stylist] image received: {media}, {len(b64)} b64 chars")
            # Find the user message that contains the photo (marked with "[Photo shared]")
            for i in range(len(messages) - 1, -1, -1):
                if messages[i]["role"] == "user" and isinstance(messages[i]["content"], str) and messages[i]["content"].startswith("[Photo shared]"):
                    messages[i] = {
                        "role": "user",
                        "content": [
                            {"type": "image", "source": {"type": "base64", "media_type": media, "data": b64}},
                            {"type": "text", "text": messages[i]["content"]},
                        ],
                    }
                    break
        else:
            description = await _run_blocking(anthropic_service.analyze_chat_image, req.image_url)
            if description:
                for i in range(len(messages) - 1, -1, -1):
                    if messages[i]["role"] == "user" and isinstance(messages[i]["content"], str) and messages[i]["content"].startswith("[Photo shared]"):
                        messages[i] = {
                            "role": "user",
                            "content": f"[Photo context: {description}]\n\n{messages[i]['content']}",
                        }
                        break

    try:
        result = await _run_blocking(
            aria_graph.run_aria,
            user_id=user["id"],
            messages=messages,
            wardrobe=wardrobe,
        )
    except Exception as e:
        raise HTTPException(500, f"Stylist failed: {e}")

    return StylistChatResponse(
        reply=result["reply"],
        suggested_item_ids=result["item_ids"],
        occasion=result.get("occasion"),
        scene=result.get("scene"),
    )


@router.get("/insight")
async def get_style_insight(user = Depends(current_user)):
    wardrobe = supabase_service.get_wardrobe_items(user["id"])
    if not wardrobe:
        return {"insight": None}
    recent = supabase_service.get_recent_tryons(user["id"], limit=20, saved_only=False)
    try:
        insight = await _run_blocking(anthropic_service.style_insight, wardrobe, recent)
    except Exception as e:
        raise HTTPException(500, f"Insight failed: {e}")
    return {"insight": insight}


@router.get("/color-profile")
async def get_color_profile(user = Depends(current_user)):
    """Return the user's cached color profile (or null if not analyzed yet)."""
    row = supabase_service.get_user(user["id"]) or {}
    return {"color_profile": row.get("color_profile")}


@router.post("/color-profile")
async def refresh_color_profile(user = Depends(current_user)):
    """Force a fresh color analysis from the user's primary selfie and cache it."""
    row = supabase_service.get_user(user["id"]) or {}
    selfie = color_service.best_profile_source(row)
    if not selfie:
        raise HTTPException(400, "No selfie on file. Upload one in Avatar Setup first.")
    profile = await _run_blocking(color_service.analyze_color_profile, selfie)
    if not profile:
        raise HTTPException(502, "Color analysis failed. Try again.")
    supabase_service.upsert_user(user["id"], color_profile=profile, color_profile_source_selfie=selfie)
    return {"color_profile": profile}


@router.get("/suggestions")
async def auto_suggestions(user = Depends(current_user)):
    wardrobe = supabase_service.get_wardrobe_items(user["id"])
    if not wardrobe:
        return {"suggestions": []}

    prompt = (
        "Suggest 3 outfit combinations from this wardrobe. For each, give a "
        "ONE-LINE name and 2-3 item IDs. Format your reply EXACTLY like:\n"
        "1. Office Polish: id-A, id-B, id-C\n"
        "2. Weekend Casual: id-D, id-E\n"
        "3. Evening Out: id-F, id-G, id-H\n"
        "Use only IDs from the wardrobe. Be brief."
    )
    try:
        reply = anthropic_service.stylist_chat(
            messages=[{"role": "user", "content": prompt}],
            wardrobe_items=wardrobe,
        )
    except Exception as e:
        raise HTTPException(500, f"Suggestions failed: {e}")

    suggestions = []
    for line in reply.splitlines():
        line = line.strip()
        if not line or ":" not in line:
            continue
        try:
            label_part, ids_part = line.split(":", 1)
            label = label_part.split(".", 1)[-1].strip()
            ids = [i.strip() for i in ids_part.split(",") if i.strip()]
            ids = [i for i in ids if any(w["id"] == i for w in wardrobe)]
            if ids:
                suggestions.append({"name": label, "item_ids": ids})
        except ValueError:
            continue

    return {"suggestions": suggestions[:3]}


_STYLE_ARCHETYPES = [
    ("Preppy", "polo shirts, chinos, loafers, pastel sweaters, structured blazers"),
    ("Old Money Quiet Luxury", "cashmere, neutral linens, tailored trousers, minimal branding"),
    ("Chic Parisian", "striped tops, trench coats, slim-leg trousers, ballet flats"),
    ("Coastal Grandmother", "linen sets, woven totes, wide-brimmed hats, earthy neutrals"),
    ("Dark Academia", "tweed, moody plaids, turtlenecks, leather oxfords, burgundy"),
    ("Winter Gothic", "black maxi coats, velvet, sheer layers, boots, dark accessories"),
    ("Winter Cozy Cottagecore", "chunky knits, plaid flannels, cozy boots, warm caramels"),
    ("Street Luxe", "oversized hoodies, joggers, sneakers, gold accessories, minimal palette"),
    ("Effortless Atelier", "bias-cut dresses, slouchy blazers, terracotta and sand, understated"),
    ("Boho Festival", "crochet tops, flowy midi skirts, layered jewelry, earthy fringe"),
    ("Clean Girl", "sleek bun, fitted basics, gold hoops, white sneakers, neutral tones"),
    ("Mob Wife Glam", "faux fur, bold prints, heeled boots, statement jewelry, rich tones"),
]


@router.get("/this-or-that")
async def this_or_that(type: str = "items", user = Depends(current_user)):
    pair_id = str(uuid.uuid4())

    if type == "styles":
        a, b = random.sample(_STYLE_ARCHETYPES, 2)
        return {
            "pair_id": pair_id,
            "question_type": "styles",
            "item_a": {"id": a[0], "name": a[0], "description": a[1]},
            "item_b": {"id": b[0], "name": b[0], "description": b[1]},
        }

    wardrobe = supabase_service.get_wardrobe_items(user["id"])
    if len(wardrobe) < 2:
        raise HTTPException(400, "Need at least 2 wardrobe items for This or That.")
    pair = random.sample(wardrobe, 2)
    return {"pair_id": pair_id, "question_type": "items", "item_a": pair[0], "item_b": pair[1]}


class ThisOrThatChoice(BaseModel):
    pair_id: str
    item_a_id: str
    item_b_id: str
    chosen_id: str
    question_type: str = "items"  # "items" | "styles"
    chosen_name: str | None = None  # for archetype choices
    rejected_name: str | None = None


@router.post("/this-or-that")
async def save_this_or_that(req: ThisOrThatChoice, user = Depends(current_user)):
    if req.chosen_id not in (req.item_a_id, req.item_b_id):
        raise HTTPException(400, "chosen_id must be one of the two item IDs.")
    row = supabase_service.get_user(user["id"]) or {}
    prefs: list = row.get("style_preferences") or []
    rejected_id = req.item_b_id if req.chosen_id == req.item_a_id else req.item_a_id
    entry: dict = {
        "pair_id": req.pair_id,
        "question_type": req.question_type,
        "a_id": req.item_a_id,
        "b_id": req.item_b_id,
        "chosen_id": req.chosen_id,
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    if req.question_type == "styles":
        entry["chosen_type"] = req.chosen_name or req.chosen_id
        entry["rejected_type"] = req.rejected_name or rejected_id
    prefs.append(entry)
    supabase_service.upsert_user(user["id"], style_preferences=prefs[-100:])
    return {"saved": True, "total_preferences": len(prefs)}


# ───────────────────────────── STYLIST SESSIONS (chat history) ───────────────────────────── #

class StylistSessionCreate(BaseModel):
    messages: list
    title: str | None = None


class StylistSessionUpdate(BaseModel):
    messages: list
    title: str | None = None


@router.get("/sessions")
async def list_stylist_sessions(user = Depends(current_user)):
    sessions = supabase_service.get_stylist_sessions(user["id"])
    return {"sessions": sessions}


@router.get("/sessions/{session_id}")
async def get_stylist_session(session_id: str, user = Depends(current_user)):
    session = supabase_service.get_stylist_session(session_id)
    if not session or session["user_id"] != user["id"]:
        raise HTTPException(404, "Session not found")
    return session


@router.post("/sessions")
async def create_stylist_session(req: StylistSessionCreate, user = Depends(current_user)):
    # Generate title from first user message if not provided
    title = req.title
    if not title:
        for m in req.messages:
            if m.get("role") == "user" and m.get("content"):
                content = m["content"]
                if isinstance(content, str):
                    title = content[:50] + ("..." if len(content) > 50 else "")
                    break
    session = supabase_service.create_stylist_session(user["id"], req.messages, title)
    return session


@router.put("/sessions/{session_id}")
async def update_stylist_session(session_id: str, req: StylistSessionUpdate, user = Depends(current_user)):
    session = supabase_service.get_stylist_session(session_id)
    if not session or session["user_id"] != user["id"]:
        raise HTTPException(404, "Session not found")
    updated = supabase_service.update_stylist_session(session_id, req.messages, req.title)
    return updated


@router.delete("/sessions/{session_id}")
async def delete_stylist_session(session_id: str, user = Depends(current_user)):
    session = supabase_service.get_stylist_session(session_id)
    if not session or session["user_id"] != user["id"]:
        raise HTTPException(404, "Session not found")
    supabase_service.delete_stylist_session(session_id)
    return {"deleted": True}