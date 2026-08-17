"""Avatar setup: selfie upload + stylized avatar generation + Aria's shared hero asset."""
import os
import logging
import httpx
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, BackgroundTasks

from services import supabase_service, avatar_pose_service, color_service
from services.auth_service import current_user
from services.image_service import validate_image_bytes
from services.rate_limit import check_cooldown
from services.usage_limits import check_avatar_refresh_cap

router = APIRouter()
logger = logging.getLogger(__name__)

# MVP cut list: skip expensive stylized avatar/video generation on upload (analysis only).
MVP_MODE = os.getenv("MVP_MODE", "1").lower() not in ("0", "false", "no")


async def _bg_refresh_profile(user_id: str, source_url: str):
    """Cheap color/body profile refresh from the best available photo (no avatar/video)."""
    try:
        # Best-effort lighting correction before the vision call -- targets the
        # "Low confidence — retake in natural light" message users otherwise
        # see (ProfileHero.tsx's confidenceLabel()) when a selfie is dim or
        # poorly lit. Never blocks: falls back to the raw selfie on any
        # failure, and the enhanced URL is only used for this one vision
        # call, never persisted as the user's selfie.
        from services import youcam_service
        analysis_source = youcam_service.youcam_photo_lighting(source_url) or source_url

        profile = color_service.analyze_color_profile(analysis_source)
        if profile:
            supabase_service.upsert_user(
                user_id, color_profile=profile, color_profile_source_selfie=source_url
            )
            logger.info(f"Profile refreshed for user {user_id}")
            from services import analytics_service
            analytics_service.capture(user_id, "color_profile_generated", {
                "season": profile.get("season"),
                "confidence": profile.get("confidence"),
                "lighting_quality": profile.get("lighting_quality"),
            })
            row = supabase_service.get_user(user_id) or {}
            if row.get("kibbe_analysis"):
                analytics_service.capture(user_id, "profiles_generated", {
                    "has_color": True,
                    "has_kibbe": True,
                    "color_confidence": profile.get("confidence"),
                    "kibbe_confidence": (row.get("kibbe_analysis") or {}).get("confidence"),
                })
    except Exception as e:
        logger.warning(f"Profile refresh failed for {user_id}: {e}")


async def _bg_refresh_kibbe(user_id: str, full_body_url: str):
    """Kibbe analysis from full-body photo — cached for Aria."""
    try:
        from services import kibbe_service
        analysis = kibbe_service.analyze_kibbe_type(full_body_url)
        if analysis:
            supabase_service.upsert_user(
                user_id,
                kibbe_type=analysis.get("kibbe_type"),
                kibbe_analysis=analysis,
                kibbe_source_photo=full_body_url,
            )
            logger.info(f"Kibbe profile refreshed for user {user_id}")
            from services import analytics_service
            analytics_service.capture(user_id, "kibbe_profile_generated", {
                "kibbe_type": analysis.get("kibbe_type"),
                "confidence": analysis.get("confidence"),
            })
            row = supabase_service.get_user(user_id) or {}
            if row.get("color_profile") and analysis:
                analytics_service.capture(user_id, "profiles_generated", {
                    "has_color": True,
                    "has_kibbe": True,
                    "color_confidence": (row.get("color_profile") or {}).get("confidence"),
                    "kibbe_confidence": analysis.get("confidence"),
                })
    except Exception as e:
        logger.warning(f"Kibbe refresh failed for {user_id}: {e}")


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

    # MVP: analysis only (no Runway stylized hero). Legacy: first photo triggers still gen.
    if MVP_MODE:
        background_tasks.add_task(_bg_refresh_profile, user["id"], public_url)
    elif not current.get("stylized_avatar_url"):
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
    row = supabase_service.get_user(user["id"]) or {}
    background_tasks.add_task(_bg_refresh_profile, user["id"], public_url)
    background_tasks.add_task(_bg_refresh_kibbe, user["id"], public_url)
    if not MVP_MODE and not row.get("stylized_avatar_url"):
        face = color_service.best_face_source(row) or public_url
        background_tasks.add_task(_bg_generate_stylized, user["id"], face, still_only=True)
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
    return {"primary_url": url}


@router.delete("/selfie")
async def delete_selfie(url: str, user = Depends(current_user)):
    row = supabase_service.get_user(user["id"]) or {}
    selfies = [u for u in (row.get("selfie_urls") or []) if u != url]
    fields = {"selfie_urls": selfies, "email": user["email"]}
    if row.get("avatar_selfie_url") == url:
        fields["avatar_selfie_url"] = selfies[0] if selfies else None
    supabase_service.upsert_user(user["id"], **fields)
    return {"selfie_urls": selfies, "primary_url": fields.get("avatar_selfie_url")}


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
    Pass ?video=true to also (re)generate the ramp-walking video (~60-100cr).

    Guard: prevents duplicate video generation if one is already ready/generating.
    Rate-limited by cooldown + monthly cap (Free tier) same as tryon/event-scene/animate."""
    check_cooldown(user["id"], "avatar-refresh", 30)
    check_avatar_refresh_cap(user["id"])
    if model not in {"gemini_2.5_flash", "gen4_image"}:
        raise HTTPException(400, f"Unsupported model: {model}")
    row = supabase_service.get_user(user["id"]) or {}
    selfie = color_service.best_face_source(row)
    if not selfie:
        raise HTTPException(400, "No selfie or full-body photo to use. Upload one first.")

    # Guard: prevent duplicate video generation (payment tier feature)
    if video:
        video_status = row.get("stylized_avatar_video_status")
        if video_status in {"ready", "generating"}:
            raise HTTPException(
                409,
                f"Ramp video already {video_status}. Regeneration limited to prevent credit waste. "
                f"(Future: Premium tier feature.)"
            )

    background_tasks.add_task(_bg_generate_stylized, user["id"], selfie, still_only=not video, model=model)
    supabase_service.record_usage_event(user["id"], "avatar_refresh")
    return {"queued": True, "with_video": video, "model": model}


@router.get("/stylist")
async def get_stylist():
    """
    Returns the configured shared admin stylist (Aria) character asset —
    her portrait image and ramp-walking hero video, shown on the dashboard
    hero as a fallback for users without a selfie yet.

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
    return {"selfie_url": row.get("avatar_selfie_url")}
