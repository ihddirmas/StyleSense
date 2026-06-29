"""Avatar/character setup: selfie upload + Runway character creation + knowledge sync."""
import os
import logging
import httpx
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, BackgroundTasks
from typing import Optional

from models.schemas import CreateCharacterRequest, SyncKnowledgeRequest
from services import supabase_service, character_service, avatar_pose_service, color_service, style_kb
from services.auth_service import current_user
from services.image_service import validate_image_bytes

router = APIRouter()
logger = logging.getLogger(__name__)


def _analyze_body_photo(image_url: str) -> dict:
    import httpx, base64, json, re
    from services.anthropic_service import client, MODEL, _require_storage_url
    try:
        _require_storage_url(image_url)
        data = httpx.get(image_url, timeout=20, follow_redirects=False).content
        b64 = base64.standard_b64encode(data).decode()
        ext = image_url.split(".")[-1].split("?")[0].lower()
        media = "image/jpeg" if ext in ("jpg", "jpeg") else f"image/{ext}"
        resp = client.messages.create(
            model=MODEL,
            max_tokens=256,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": media, "data": b64}},
                    {"type": "text", "text": (
                        'Analyze this full-body photo. Return JSON only:\n'
                        '{"height_impression":"tall|average|petite",'
                        '"body_shape":"hourglass|pear|apple|rectangle|inverted_triangle",'
                        '"skin_undertone":"warm|cool|neutral",'
                        '"fit_notes":"one sentence about flattering silhouettes"}'
                    )},
                ],
            }],
        )
        m = re.search(r"\{.*\}", resp.content[0].text.strip(), re.DOTALL)
        if m:
            return json.loads(m.group())
    except Exception as e:
        logger.warning(f"Body analysis failed: {e}")
    return {}


@router.post("/upload-body-photo")
async def upload_body_photo(file: UploadFile = File(...), user = Depends(current_user)):
    data = await file.read()
    try:
        validate_image_bytes(data, file.content_type or "")
    except ValueError as e:
        raise HTTPException(400, str(e))
    body_url = supabase_service.upload_to_storage(
        "selfies", user["id"], data, file.filename or "body.jpg", file.content_type or "image/jpeg"
    )
    analysis = _analyze_body_photo(body_url)
    supabase_service.upsert_user(user["id"], full_body_url=body_url, body_analysis=analysis)
    return {"full_body_url": body_url, "body_analysis": analysis}


async def _bg_refresh_profile(user_id: str, source_url: str):
    """Cheap color/body profile refresh from the best available photo (no avatar/video)."""
    try:
        profile = color_service.analyze_color_profile(source_url)
        if profile:
            supabase_service.upsert_user(
                user_id, color_profile=profile, color_profile_source_selfie=source_url
            )
            logger.info(f"Profile refreshed for user {user_id}")
    except Exception as e:
        logger.warning(f"Profile refresh failed for {user_id}: {e}")


async def _bg_generate_stylized(user_id: str, selfie_url: str, still_only: bool = True, model: str = "gemini_2.5_flash"):
    """
    ON-DEMAND avatar pipeline (triggered by /regenerate-stylized, never on upload):
      1. Realistic, face-preserving hero - manifests the user in their recent outfit (~5cr)
      2. (only when still_only=False) ramp-walking video chained on the still (~60-100cr)
    Also refreshes the cheap color/body profile from the best photo.
    """
    row = supabase_service.get_user(user_id) or {}
    body_url = row.get("full_body_url")
    profile_src = color_service.best_profile_source(row) or selfie_url

    # Stage 0: color profile (cheap vision) - recompute when the source changes.
    if row.get("color_profile_source_selfie") != profile_src:
        await _bg_refresh_profile(user_id, profile_src)

    # Stage 1: realistic hero (always regenerated on an explicit refresh request).
    try:
        result = await avatar_pose_service.generate_realistic_hero(user_id, selfie_url, body_url=body_url, model=model)
        stylized_url = result.get("url")
        logger.info(f"Realistic hero ready for user {user_id}")
    except Exception as e:
        logger.warning(f"Hero gen failed for {user_id}: {e}")
        return

    if not stylized_url or still_only:
        return

    # Stage 2: video ----------------------------------------------------------
    # Re-read row in case stage 1 updated it.
    row = supabase_service.get_user(user_id) or {}
    video_already_good = (
        row.get("stylized_avatar_video_source") == stylized_url
        and row.get("stylized_avatar_video_status") == "ready"
        and row.get("stylized_avatar_video_url")
    )
    if video_already_good:
        logger.info(f"Stylized video already cached for {user_id}; nothing to do")
        return

    try:
        await avatar_pose_service.generate_stylized_video(user_id, stylized_url)
        logger.info(f"Stylized ramp video ready for user {user_id}")
    except Exception as e:
        logger.warning(f"Stylized video gen failed for {user_id}: {e}")


@router.post("/upload-selfie")
async def upload_selfie(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user = Depends(current_user),
):
    """
    Upload a new selfie. Appends to selfie_urls array. Sets as primary
    (avatar_selfie_url) only if user has no primary yet OR fewer than 2 selfies.

    Side effect: if this becomes the primary selfie, kick off async generation of
    the stylized editorial-3D full-body avatar (used as the Studio idle hero).
    """
    content = await file.read()
    try:
        validate_image_bytes(content, file.content_type or "")
    except ValueError as e:
        raise HTTPException(400, str(e))

    public_url = supabase_service.upload_to_storage(
        bucket="selfies",
        user_id=user["id"],
        file_bytes=content,
        filename=file.filename or "selfie.jpg",
        content_type=file.content_type or "image/jpeg",
    )

    # Append to selfie_urls array
    current = supabase_service.get_user(user["id"]) or {}
    selfies = list(current.get("selfie_urls") or [])
    if public_url not in selfies:
        selfies.append(public_url)
    selfies = selfies[-3:]  # cap at 3 most recent

    becomes_primary = not current.get("avatar_selfie_url") or len(selfies) == 1
    fields = {"selfie_urls": selfies, "email": user["email"]}
    if becomes_primary:
        fields["avatar_selfie_url"] = public_url
    try:
        supabase_service.upsert_user(user["id"], **fields)
    except Exception:
        # Fall back without selfie_urls if column doesn't exist yet
        supabase_service.upsert_user(
            user["id"], avatar_selfie_url=public_url, email=user["email"]
        )

    # First photo ever -> build the avatar automatically (~2cr, still only) so the
    # Studio shows it without a manual Refresh. If they already have an avatar, just
    # do the cheap profile refresh (avatar changes stay on the "Refresh my avatar" button).
    if not current.get("stylized_avatar_url"):
        background_tasks.add_task(_bg_generate_stylized, user["id"], public_url, still_only=True)
    elif becomes_primary:
        background_tasks.add_task(_bg_refresh_profile, user["id"], public_url)

    return {"selfie_url": public_url, "selfie_urls": selfies}


@router.get("/selfies")
async def list_selfies(user = Depends(current_user)):
    row = supabase_service.get_user(user["id"]) or {}
    primary = row.get("avatar_selfie_url")
    urls = list(row.get("selfie_urls") or [])
    if primary and primary not in urls:
        urls.insert(0, primary)
    return {"selfie_urls": urls, "primary_url": primary}


@router.post("/upload-full-body")
async def upload_full_body(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user = Depends(current_user),
):
    """Upload a full-body photo (for body-aware styling). Stored on users.full_body_url.
    Kicks off a profile re-analysis using it (covers color + body + hair)."""
    content = await file.read()
    try:
        validate_image_bytes(content, file.content_type or "")
    except ValueError as e:
        raise HTTPException(400, str(e))

    public_url = supabase_service.upload_to_storage(
        bucket="selfies",
        user_id=user["id"],
        file_bytes=content,
        filename=file.filename or "fullbody.jpg",
        content_type=file.content_type or "image/jpeg",
    )
    supabase_service.upsert_user(user["id"], full_body_url=public_url, email=user["email"])
    # First photo ever -> auto-build the avatar (uses the best face source). Otherwise
    # just refresh the cheap profile from the new full-body photo.
    row = supabase_service.get_user(user["id"]) or {}
    if not row.get("stylized_avatar_url"):
        face = color_service.best_face_source(row) or public_url
        background_tasks.add_task(_bg_generate_stylized, user["id"], face, still_only=True)
    else:
        background_tasks.add_task(_bg_refresh_profile, user["id"], public_url)
    return {"full_body_url": public_url}


@router.get("/full-body")
async def get_full_body(user = Depends(current_user)):
    row = supabase_service.get_user(user["id"]) or {}
    return {"full_body_url": row.get("full_body_url")}


@router.post("/set-primary-selfie")
async def set_primary_selfie(
    background_tasks: BackgroundTasks,
    url: str = Form(...),
    user = Depends(current_user),
):
    row = supabase_service.get_user(user["id"]) or {}
    selfies = list(row.get("selfie_urls") or [])
    if url not in selfies:
        raise HTTPException(404, "That selfie isn't in your list. Upload it first.")
    supabase_service.upsert_user(user["id"], avatar_selfie_url=url, email=user["email"])
    # Profile refresh only; the avatar is ON-DEMAND ("Refresh my avatar").
    background_tasks.add_task(_bg_refresh_profile, user["id"], url)
    return {"primary_url": url, "needs_avatar_recreate": bool(row.get("avatar_character_id"))}


@router.delete("/selfie")
async def delete_selfie(url: str, user = Depends(current_user)):
    row = supabase_service.get_user(user["id"]) or {}
    selfies = [u for u in (row.get("selfie_urls") or []) if u != url]
    fields = {"selfie_urls": selfies, "email": user["email"]}
    if row.get("avatar_selfie_url") == url:
        fields["avatar_selfie_url"] = selfies[0] if selfies else None
    supabase_service.upsert_user(user["id"], **fields)
    return {"selfie_urls": selfies, "primary_url": fields.get("avatar_selfie_url")}


@router.post("/create-character")
async def create_character(req: CreateCharacterRequest, user = Depends(current_user)):
    instructions = character_service.build_stylist_instructions(req.name)
    try:
        result = await character_service.create_character(
            selfie_url=req.selfie_url,
            name=req.name,
            instructions=instructions,
            voice_id=req.voice,  # None falls back to RUNWAY_DEFAULT_VOICE_ID env
        )
    except RuntimeError as e:
        raise HTTPException(
            status_code=501,
            detail={
                "message": str(e),
                "fallback": (
                    "Programmatic creation failed. Go to https://dev.runwayml.com → Characters → "
                    "Create Character. Upload your selfie, paste the instructions shown, "
                    "then call POST /api/avatar/save-character-id with the resulting UUID."
                ),
                "instructions_text": instructions,
            },
        )

    character_id = result.get("id") or result.get("avatarId")
    supabase_service.upsert_user(user["id"], avatar_character_id=character_id, email=user["email"])
    return {"character_id": character_id, "raw": result}


@router.post("/recreate-character")
async def recreate_character(req: CreateCharacterRequest, user = Depends(current_user)):
    """
    Force-recreate the avatar with the given selfie. Used when the user
    swaps their primary selfie or wants a fresh character.
    Same body as /create-character. Replaces user's avatar_character_id.
    """
    instructions = character_service.build_stylist_instructions(req.name)
    try:
        result = await character_service.create_character(
            selfie_url=req.selfie_url, name=req.name,
            instructions=instructions, voice_id=req.voice,
        )
    except RuntimeError as e:
        raise HTTPException(500, str(e))

    character_id = result.get("id") or result.get("avatarId")
    supabase_service.upsert_user(
        user["id"], avatar_character_id=character_id,
        avatar_selfie_url=req.selfie_url, email=user["email"],
    )
    return {"character_id": character_id, "raw": result}


@router.post("/refresh-voice")
async def refresh_voice(user = Depends(current_user)):
    """
    PATCH the user's existing avatar to use the latest RUNWAY_DEFAULT_VOICE_ID.
    Useful when the default voice is updated server-side and the user wants
    their already-created avatar to switch to it without full recreation.
    """
    row = supabase_service.get_user(user["id"]) or {}
    char_id = row.get("avatar_character_id")
    if not char_id:
        raise HTTPException(400, "No avatar character to update. Create one first.")
    try:
        result = await character_service.update_character_voice(char_id)
        new_voice = (result.get("voice") or {}).get("id")
        return {"character_id": char_id, "voice_id": new_voice, "ok": True}
    except RuntimeError as e:
        raise HTTPException(500, str(e))


@router.post("/save-character-id")
async def save_character_id(
    character_id: str = Form(...),
    voice_id: Optional[str] = Form(None),
    user = Depends(current_user),
):
    fields = {"avatar_character_id": character_id, "email": user["email"]}
    if voice_id:
        fields["avatar_voice_id"] = voice_id
    supabase_service.upsert_user(user["id"], **fields)
    return {"saved": True}


@router.post("/sync-wardrobe-knowledge")
async def sync_wardrobe_knowledge(_req: SyncKnowledgeRequest = None, user = Depends(current_user)):
    user_row = supabase_service.get_user(user["id"])
    if not user_row:
        # Auto-create on the fly
        supabase_service.upsert_user(user["id"], email=user["email"])
        user_row = supabase_service.get_user(user["id"])

    items = supabase_service.get_wardrobe_items(user["id"])
    if not items:
        raise HTTPException(400, "Wardrobe is empty - add items first.")

    knowledge_text = character_service.build_wardrobe_knowledge_text(
        items, user_name=user_row.get("full_name") or "User"
    )

    if not user_row.get("avatar_character_id"):
        return {
            "wardrobe_text": knowledge_text,
            "item_count": len(items),
            "uploaded": False,
            "reason": "No character_id on user yet.",
        }

    try:
        doc = await character_service.upload_knowledge_document(
            content=knowledge_text, name=f"wardrobe-{user['id']}.txt"
        )
        doc_id = doc.get("id")
        await character_service.attach_document_to_character(
            user_row["avatar_character_id"], doc_id
        )
        try:
            supabase_service.upsert_user(user["id"], avatar_document_id=doc_id, email=user["email"])
        except Exception as e:
            # Optional local bookkeeping - don't fail the sync if the column is missing
            import logging
            logging.getLogger(__name__).warning(f"Could not save avatar_document_id locally: {e}")
        return {
            "wardrobe_text": knowledge_text,
            "item_count": len(items),
            "uploaded": True,
            "document_id": doc_id,
        }
    except RuntimeError as e:
        return {
            "wardrobe_text": knowledge_text,
            "item_count": len(items),
            "uploaded": False,
            "reason": str(e),
        }


@router.get("/stylized")
async def get_stylized(user = Depends(current_user)):
    """
    Read the user's stylized full-body editorial-3D avatar (hybrid-aesthetic
    sibling of the photoreal selfie). Returns:
      { url, status, source_selfie }
    where status is 'idle' | 'generating' | 'ready' | 'failed' | 'no_selfie'.
    """
    row = supabase_service.get_user(user["id"]) or {}
    if not row.get("avatar_selfie_url"):
        return {"url": None, "status": "no_selfie", "source_selfie": None}
    return {
        "url": row.get("stylized_avatar_url"),
        "status": row.get("stylized_avatar_status") or "idle",
        "source_selfie": row.get("stylized_avatar_source_selfie"),
    }


@router.get("/stylized-video")
async def get_stylized_video(user = Depends(current_user)):
    """
    Read the user's stylized ramp-walking video. Returns:
      { url, status, source }
    where status is 'idle' | 'generating' | 'ready' | 'failed' | 'no_selfie'.
    """
    row = supabase_service.get_user(user["id"]) or {}
    if not row.get("avatar_selfie_url"):
        return {"url": None, "status": "no_selfie", "source": None}
    return {
        "url": row.get("stylized_avatar_video_url"),
        "status": row.get("stylized_avatar_video_status") or "idle",
        "source": row.get("stylized_avatar_video_source"),
    }


@router.post("/regenerate-stylized")
async def regenerate_stylized(
    background_tasks: BackgroundTasks,
    video: bool = False,
    model: str = "gemini_2.5_flash",
    user = Depends(current_user),
):
    """On-demand 'Refresh my avatar'. Regenerates the realistic hero still (~2-5cr).
    Default model is Gemini Flash; pass ?model=gen4_image for the gen4 path.
    Pass ?video=true to also (re)generate the ramp-walking video (~60-100cr)."""
    if model not in {"gemini_2.5_flash", "gen4_image"}:
        raise HTTPException(400, f"Unsupported model: {model}")
    row = supabase_service.get_user(user["id"]) or {}
    selfie = color_service.best_face_source(row)
    if not selfie:
        raise HTTPException(400, "No selfie or full-body photo to use. Upload one first.")
    background_tasks.add_task(_bg_generate_stylized, user["id"], selfie, still_only=not video, model=model)
    return {"queued": True, "with_video": video, "model": model}


@router.post("/sync-stylist-kb")
async def sync_stylist_kb(user = Depends(current_user)):
    """
    Sync the calling user's wardrobe to the SHARED admin stylist (Aria) by
    PATCHing her `personality` with the user's items embedded + strict
    format rules. Personality is the only field Runway's voice agent is
    documented to read for custom avatars, so this is the load-bearing path.

    Also attempts to attach a knowledge document (best-effort, may help if
    Runway ever starts consuming document_ids for realtime).

    Awaits both calls before returning. The frontend MUST await this before
    starting a realtime session.
    """
    char_id = os.getenv("STYLIST_CHARACTER_ID")
    if not char_id:
        raise HTTPException(503, "STYLIST_CHARACTER_ID not configured.")

    user_row = supabase_service.get_user(user["id"]) or {}
    items = supabase_service.get_wardrobe_items(user["id"])

    # Color profile: use cached, else derive once from the primary selfie.
    profile = user_row.get("color_profile")
    if not profile:
        selfie = user_row.get("selfie_url") or (user_row.get("selfie_urls") or [None])[0]
        if selfie:
            profile = color_service.analyze_color_profile(selfie)
            if profile:
                try:
                    supabase_service.upsert_user(
                        user["id"], color_profile=profile, color_profile_source_selfie=selfie
                    )
                except Exception as e:
                    logger.info(f"Could not cache color profile: {e}")

    kb_snippets = style_kb.retrieve(query="", color_profile=profile, occasion=None)

    persona = character_service.build_dynamic_persona(
        user_name=user_row.get("full_name") or "the user",
        items=items,
        color_profile_text=color_service.format_color_profile(profile),
        style_notes=kb_snippets,
    )

    # Load-bearing: PATCH personality and AWAIT. If this fails, fail the whole
    # call so the frontend knows not to start the session with a stale persona.
    try:
        await character_service.update_character_personality(char_id, persona)
    except RuntimeError as e:
        raise HTTPException(502, f"Could not PATCH stylist personality: {e}")

    # Best-effort: also attach a knowledge document. If it fails the persona
    # still has the wardrobe inline, so we don't surface this error.
    doc_id = None
    if items:
        try:
            knowledge_text = character_service.build_wardrobe_knowledge_text(
                items, user_name=user_row.get("full_name") or "the user"
            )
            doc = await character_service.upload_knowledge_document(
                content=knowledge_text, name=f"wardrobe-{user['id']}.txt"
            )
            doc_id = doc.get("id")
            await character_service.attach_document_to_character(char_id, doc_id)
        except Exception as e:
            logger.info(f"Doc attach skipped (best-effort): {e}")

    return {
        "synced": True,
        "item_count": len(items),
        "character_id": char_id,
        "personality_bytes": len(persona),
        "document_id": doc_id,
    }


@router.get("/stylist")
async def get_stylist():
    """
    Returns the configured shared admin stylist character.
    Every user's voice avatar session uses this character.

    No auth required (the character is a brand asset, same for everyone).
    Set STYLIST_CHARACTER_ID in backend/.env to wire it up. Run
    `python -m scripts.setup_admin_stylist` once to create it.
    """
    char_id = os.getenv("STYLIST_CHARACTER_ID")
    if not char_id:
        raise HTTPException(
            status_code=503,
            detail={
                "message": "Admin stylist not configured.",
                "fix": "Run `python -m scripts.setup_admin_stylist` then add STYLIST_CHARACTER_ID to backend/.env and frontend/.env.local.",
            },
        )

    api_key = os.getenv("RUNWAY_API_KEY") or os.getenv("RUNWAYML_API_SECRET")
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(
                f"https://api.dev.runwayml.com/v1/avatars/{char_id}",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "X-Runway-Version": "2024-11-06",
                },
            )
        if r.status_code >= 400:
            raise HTTPException(
                502,
                f"Could not fetch stylist from Runway ({r.status_code}). "
                f"Is STYLIST_CHARACTER_ID still valid?"
            )
        data = r.json()
        return {
            "character_id": char_id,
            "name": data.get("name"),
            "image_url": data.get("processedImageUri") or data.get("referenceImageUri"),
            "status": data.get("status", "UNKNOWN"),
            "ready": data.get("status") == "READY",
            "voice_name": (data.get("voice") or {}).get("name"),
            "voice_id": (data.get("voice") or {}).get("id"),
            "hero_video_url": os.getenv("STYLIST_HERO_VIDEO_URL"),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Stylist fetch failed: {e}")


@router.get("/me")
async def get_avatar_state(user = Depends(current_user)):
    """Return cached avatar fields for the current user."""
    row = supabase_service.get_user(user["id"]) or {}
    return {
        "selfie_url": row.get("avatar_selfie_url"),
        "character_id": row.get("avatar_character_id"),
    }


@router.get("/status")
async def get_avatar_status(user = Depends(current_user)):
    """
    Live status of the user's Runway avatar character.
    Returns one of:
      - { ready: false, status: "no_character" } — no avatar created yet
      - { ready: false, status: "PROCESSING" }   — avatar is still being built
      - { ready: true,  status: "READY" }        — safe to start a voice session
      - { ready: false, status: "FAILED", failure: "..." }
    """
    row = supabase_service.get_user(user["id"]) or {}
    char_id = row.get("avatar_character_id")
    if not char_id:
        return {"ready": False, "status": "no_character"}

    import httpx, os
    api_key = os.getenv("RUNWAY_API_KEY") or os.getenv("RUNWAYML_API_SECRET")
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(
                f"https://api.dev.runwayml.com/v1/avatars/{char_id}",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "X-Runway-Version": "2024-11-06",
                },
            )
        if r.status_code >= 400:
            return {"ready": False, "status": f"http_{r.status_code}", "detail": r.text[:200]}
        data = r.json()
        status = data.get("status", "UNKNOWN")
        return {
            "ready": status == "READY",
            "status": status,
            "voice_id": (data.get("voice") or {}).get("id"),
            "voice_name": (data.get("voice") or {}).get("name"),
        }
    except Exception as e:
        return {"ready": False, "status": "error", "detail": str(e)}
