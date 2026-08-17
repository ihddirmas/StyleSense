"""Anthropic-powered stylist chat (Aria LangGraph agent)."""
import asyncio
import base64
import logging
import random
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from models.schemas import (
    StylistChatRequest,
    StylistChatResponse,
    StylistFeedbackRequest,
    StylistWardrobeDetectRequest,
    StylistWardrobeDetectResponse,
    StylistWardrobeConfirmRequest,
    StylistWardrobeConfirmResponse,
    ToolConfirmRequest,
    ToolConfirmResponse,
    DetectedItem,
)
from services import supabase_service, anthropic_service, color_service, kibbe_service, wardrobe_vision_service, aria_tools, analytics_service, aria_memory_service, outfit_combo_service, capsule_service
from services.auth_service import current_user
from services.rate_limit import check_rate_limit_async
from services.wardrobe_add_service import confirm_and_add_items
from graphs import aria_graph

logger = logging.getLogger(__name__)
router = APIRouter()
_executor = ThreadPoolExecutor(max_workers=4)


async def _run_blocking(fn, *args, **kwargs):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, lambda: fn(*args, **kwargs))


@router.post("/chat", response_model=StylistChatResponse)
async def chat(req: StylistChatRequest, user = Depends(current_user)):
    await check_rate_limit_async(user["id"], "chat", limit=20, window_seconds=60)
    if not req.messages:
        raise HTTPException(400, "Need at least one message.")
    if not req.messages[-1].content.strip():
        # An empty/whitespace-only text block reaches Anthropic's API as an
        # invalid content block and crashes as an unhandled 500 further down
        # -- reject it here with a clean error instead.
        raise HTTPException(400, "Message can't be empty.")

    wardrobe = supabase_service.get_wardrobe_items(user["id"])
    messages = [m.model_dump() for m in req.messages]

    photo_url = None
    if req.image_url:
        if req.image_url.startswith("data:"):
            # Embed directly as a vision block — Aria (Sonnet) sees the raw image.
            header, b64 = req.image_url.split(",", 1)
            media = header.split(":")[1].split(";")[0]
            # Also rehost to a permanent URL -- needed if Aria proposes adding this
            # photo's items to the wardrobe (add_wardrobe_items tool).
            try:
                photo_url = supabase_service.upload_to_storage(
                    bucket="wardrobe",
                    user_id=user["id"],
                    file_bytes=base64.b64decode(b64),
                    filename="chat-upload.jpg",
                    content_type=media,
                )
            except Exception as e:
                logger.warning(f"Could not upload chat photo to storage: {e}")
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
            pending_photo_url=photo_url,
        )
    except Exception as e:
        logger.exception("Aria chat turn failed")
        raise HTTPException(500, str(e))

    pending_action = result.get("pending_action")
    if pending_action:
        # Persist exactly what Aria proposed (server-validated by build_pending_action)
        # so /tool-confirm executes this, never whatever tool_input a client sends back.
        supabase_service.create_stylist_tool_call_proposal(
            tool_use_id=pending_action["tool_use_id"],
            user_id=user["id"],
            tool_name=pending_action["tool_name"],
            tool_input=pending_action["tool_input"],
        )

    reply = result["reply"]
    item_ids = result.get("item_ids") or []
    if reply and (item_ids or result.get("product_preview")):
        analytics_service.capture(user["id"], "stylist_recommendation_delivered", {
            "item_count": len(item_ids),
            "has_product_preview": bool(result.get("product_preview")),
            "has_pending_action": bool(pending_action),
        })
        last_user = next((m.content for m in reversed(req.messages) if m.role == "user"), "")
        if isinstance(last_user, str) and (
            "http" in last_user.lower() or "suit" in last_user.lower() or "url" in last_user.lower()
        ):
            analytics_service.capture(user["id"], "first_grounded_recommendation", {
                "item_count": len(item_ids),
                "had_url": "http" in last_user.lower(),
            })

    return StylistChatResponse(
        reply=reply,
        suggested_item_ids=item_ids,
        occasion=result.get("occasion"),
        scene=result.get("scene"),
        pending_action=pending_action,
        product_preview=result.get("product_preview"),
        capsule_plan=result.get("capsule_plan"),
    )


@router.post("/tool-confirm", response_model=ToolConfirmResponse)
async def tool_confirm(req: ToolConfirmRequest, user = Depends(current_user)):
    """Execute (or cancel) a tool call Aria proposed in the last chat turn. Always
    executes the server-persisted tool_input from propose time -- the request body
    is only a lookup key (tool_use_id) plus a decision, never executable input."""
    row = supabase_service.get_stylist_tool_call(req.tool_use_id)
    if not row or row["user_id"] != user["id"] or row["tool_name"] != req.tool_name:
        raise HTTPException(404, "Action not found.")

    if req.decision != "confirm":
        supabase_service.update_stylist_tool_call(req.tool_use_id, status="cancelled")
        return ToolConfirmResponse(executed=False, summary="Cancelled.")

    if row["status"] == "done":
        return ToolConfirmResponse(executed=True, summary=row.get("result_summary") or "Already done.")
    if row["status"] != "proposed":
        raise HTTPException(409, "This action can no longer be confirmed.")

    if not supabase_service.claim_stylist_tool_call(req.tool_use_id):
        raise HTTPException(409, "This action was already confirmed.")

    try:
        result = await aria_tools.execute_confirmed_tool(row["tool_name"], row["tool_input"], user["id"])
    except Exception as e:
        logger.exception("Tool confirm execution failed for %s", row["tool_name"])
        supabase_service.update_stylist_tool_call(req.tool_use_id, status="failed")
        raise HTTPException(500, str(e))

    supabase_service.update_stylist_tool_call(req.tool_use_id, status="done", result_summary=result["summary"])
    return ToolConfirmResponse(executed=True, **result)


@router.post("/feedback")
async def stylist_feedback(req: StylistFeedbackRequest, user=Depends(current_user)):
    """Thumbs up/down on an Aria reply — stored in users.aria_memory for future turns."""
    if req.rating not in ("up", "down"):
        raise HTTPException(400, "rating must be 'up' or 'down'")
    try:
        mem = aria_memory_service.append_verdict_feedback(
            user["id"],
            rating=req.rating,
            verdict=req.verdict,
            item_ids=req.item_ids,
            url=req.url,
            note=req.note,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    analytics_service.capture(user["id"], "stylist_feedback", {"rating": req.rating})
    return {"ok": True, "memory": mem}


@router.get("/memory")
async def get_aria_memory(user=Depends(current_user)):
    return {"memory": aria_memory_service.get_memory(user["id"])}


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


@router.get("/opening-note")
async def get_opening_note(user = Depends(current_user)):
    """
    Data-grounded opening note for a fresh Aria chat thread — reuses the same
    outfit_combo_service / capsule_service pipelines as /wardrobe's
    outfit-suggestions endpoint and Aria's own list_wardrobe_gaps tool, so
    opening /stylist with no history feels like she already looked at the
    closet instead of a blank greeting. No wardrobe -> {"type": None}.
    """
    row = supabase_service.get_user(user["id"]) or {}
    wardrobe = supabase_service.get_wardrobe_items(user["id"])
    if not wardrobe:
        return {"type": None, "caption": None, "item_ids": None}

    color_profile = row.get("color_profile")
    kibbe_analysis = row.get("kibbe_analysis")
    kibbe_type = (kibbe_analysis or {}).get("kibbe_type")
    kibbe_ref = kibbe_service.get_type_reference(kibbe_type) if kibbe_type else None

    try:
        suggestions = await _run_blocking(
            outfit_combo_service.build_outfit_suggestions, wardrobe, color_profile, kibbe_ref
        )
    except Exception as e:
        logger.warning(f"opening-note outfit suggestion failed for {user['id']}: {e}")
        suggestions = []

    if suggestions:
        top = suggestions[0]
        return {
            "type": "outfit",
            "caption": top["caption"],
            "item_ids": [it["id"] for it in top["items"]],
        }

    gaps = capsule_service.list_wardrobe_gaps(
        wardrobe, dress_code="casual", days=5, color_profile=color_profile, kibbe_analysis=kibbe_analysis
    )
    if gaps["gaps"]:
        return {"type": "gap", "caption": gaps["gaps"][0]["suggestion"], "item_ids": None}

    return {"type": None, "caption": None, "item_ids": None}


@router.get("/profiles")
async def get_style_profiles(user = Depends(current_user)):
    """Combined color + Kibbe profiles for onboarding reveal and dashboard."""
    row = supabase_service.get_user(user["id"]) or {}
    color = row.get("color_profile")
    kibbe = row.get("kibbe_analysis")
    return {
        "color_profile": color,
        "kibbe_analysis": kibbe,
        "kibbe_type": row.get("kibbe_type"),
        "ready": bool(color and kibbe),
        "has_color": bool(color),
        "has_kibbe": bool(kibbe),
        # Lets the dashboard distinguish "never uploaded anything" (show the full
        # onboarding CTA) from "uploaded a photo but analysis hasn't run/finished
        # yet" (show a lighter pending state instead of nagging to start over).
        "has_photo": bool(color_service.best_profile_source(row)),
    }


@router.get("/analysis-report")
async def get_analysis_report(user = Depends(current_user)):
    """
    Visual color + Kibbe body-type analysis report: season palette swatches,
    best-lines/avoid reference, and a short personalized narrative. Reuses
    the already-cached color_profile/kibbe_analysis -- no new vision calls.
    """
    row = supabase_service.get_user(user["id"]) or {}
    color_profile = row.get("color_profile")
    kibbe_analysis = row.get("kibbe_analysis")

    if not color_profile or not kibbe_analysis:
        return {
            "ready": False,
            "has_color": bool(color_profile),
            "has_kibbe": bool(kibbe_analysis),
            # Distinguishes "never uploaded" from "uploaded, analysis pending/failed"
            # so the frontend doesn't tell someone who already has a photo on file
            # to upload one again.
            "has_photo": bool(color_service.best_profile_source(row)),
        }

    kibbe_type = kibbe_analysis.get("kibbe_type")
    kibbe_ref = kibbe_service.get_type_reference(kibbe_type)
    kibbe_display = (kibbe_type or "").replace("_", " ").title()

    narrative = await _run_blocking(
        anthropic_service.style_analysis_narrative,
        color_profile, kibbe_display, kibbe_ref.get("style_essence", ""),
    )
    if not narrative:
        flattering_preview = ", ".join((color_profile.get("flattering_colors") or [])[:3]) or "your flattering colors"
        narrative = (
            f"As a {color_profile.get('season', 'your')} season with a {kibbe_display or 'balanced'} line, "
            f"you look most put-together in {flattering_preview} and silhouettes that follow your natural shape."
        )

    skin_result = row.get("skin_analysis_result") or {}
    skin_colors = skin_result.get("colors") or {}

    face_shape = color_profile.get("face_shape")

    return {
        "ready": True,
        "color": {
            "season": color_profile.get("season"),
            "undertone": color_profile.get("undertone"),
            "contrast": color_profile.get("contrast"),
            "confidence": color_profile.get("confidence"),
            "flattering_colors": color_profile.get("flattering_colors") or [],
            "avoid_colors": color_profile.get("avoid_colors") or [],
            "swatches": color_service.get_season_swatches(color_profile.get("season")),
        },
        "kibbe": {
            "type": kibbe_type,
            "type_display": kibbe_display,
            "confidence": kibbe_analysis.get("confidence"),
            "style_essence": kibbe_ref.get("style_essence", ""),
            "best_lines": kibbe_ref.get("best_lines", ""),
            "best_fabrics": kibbe_ref.get("best_fabrics", ""),
            "avoid": kibbe_ref.get("avoid", ""),
        },
        "face_shape": {
            "shape": face_shape,
            "shape_display": color_service.get_face_shape_display(face_shape),
            "source": color_profile.get("face_shape_source"),
            "style_tip": color_service.get_face_shape_style_tip(face_shape),
        } if face_shape else None,
        "skin": {
            "has_skin": row.get("skin_analysis_status") == "ready" and bool(skin_colors),
            "colors": skin_colors,
        },
        "narrative": narrative,
    }


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


@router.get("/kibbe-profile")
async def get_kibbe_profile(user = Depends(current_user)):
    """Return the user's cached Kibbe analysis (or null if not analyzed yet)."""
    row = supabase_service.get_user(user["id"]) or {}
    return {
        "kibbe_analysis": row.get("kibbe_analysis"),
        "kibbe_type": row.get("kibbe_type"),
    }


@router.post("/kibbe-profile")
async def refresh_kibbe_profile(user = Depends(current_user)):
    """Force a fresh Kibbe analysis from the user's full-body photo and cache it."""
    row = supabase_service.get_user(user["id"]) or {}
    full_body = (row.get("full_body_url") or "").strip()
    if not full_body:
        raise HTTPException(400, "No full-body photo on file. Upload one in Avatar Setup first.")
    analysis = await _run_blocking(kibbe_service.analyze_kibbe_type, full_body)
    if not analysis:
        raise HTTPException(502, "Kibbe analysis failed. Try again.")
    supabase_service.upsert_user(
        user["id"],
        kibbe_type=analysis.get("kibbe_type"),
        kibbe_analysis=analysis,
        kibbe_source_photo=full_body,
    )
    return {"kibbe_analysis": analysis, "kibbe_type": analysis.get("kibbe_type")}


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


# ───────────────────────────── WARDROBE ADD FROM CHAT ───────────────────────────── #

@router.post("/wardrobe-detect", response_model=StylistWardrobeDetectResponse)
async def wardrobe_detect(req: StylistWardrobeDetectRequest, user = Depends(current_user)):
    """
    Detect items in a chat-uploaded photo (base64 data URI). Parses, uploads to
    Supabase, runs Claude vision, returns detected items + the permanent image URL.
    """
    if not req.image_data.startswith("data:"):
        raise HTTPException(400, "image_data must be a base64 data URI")
    
    try:
        header, b64 = req.image_data.split(",", 1)
        media = header.split(":")[1].split(";")[0]
        import base64
        image_bytes = base64.b64decode(b64)
    except Exception as e:
        raise HTTPException(400, f"Invalid data URI: {e}")
    
    # Upload to Supabase
    try:
        image_url = supabase_service.upload_to_storage(
            bucket="wardrobe",
            user_id=user["id"],
            file_bytes=image_bytes,
            filename="chat-upload.jpg",
            content_type=media,
        )
    except Exception as e:
        raise HTTPException(500, f"Upload failed: {e}")
    
    # Detect items
    detected_raw = wardrobe_vision_service.detect_items_from_bytes(image_bytes, media)
    detected = [DetectedItem(**d) for d in detected_raw]
    
    return StylistWardrobeDetectResponse(detected=detected, image_url=image_url)


@router.post("/wardrobe-confirm", response_model=StylistWardrobeConfirmResponse)
async def wardrobe_confirm(req: StylistWardrobeConfirmRequest, user = Depends(current_user)):
    """
    Confirm and add detected items to wardrobe. Runs Runway isolation per item in
    parallel (like /wardrobe/add-multi), then inserts to DB with tag "chat-added".
    Returns created items + failures + summary string.
    """
    if not req.items:
        raise HTTPException(400, "items list is empty")

    created, failed, summary = await confirm_and_add_items(
        user_id=user["id"], source_image_url=req.source_image_url, items=req.items,
    )
    return StylistWardrobeConfirmResponse(created=created, failed=failed, summary=summary)