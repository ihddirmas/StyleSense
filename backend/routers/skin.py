"""Skin tone analysis: YouCam Skin AI integration.

Runs on-demand (Settings/Onboarding "Analyze my skin" action) rather than
automatically on every selfie upload, since it's a paid API call and the
selfie flow already triggers a color-profile analysis by default.

Uses YouCam's skin-tone-analysis (skin/hair/eye/lip hex colors) rather than
a concern-score report -- it plugs directly into the same "what colors
flatter you" reasoning color_service.py already does for Aria.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException

from services import supabase_service
from services.auth_service import current_user
from services.tryon_service import run_blocking as _run_blocking

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/analyze")
async def analyze_skin(user=Depends(current_user)):
    """Run YouCam skin-tone analysis on the user's primary selfie and store the result."""
    row = supabase_service.get_user(user["id"]) or {}
    selfie_url = row.get("avatar_selfie_url")
    if not selfie_url:
        raise HTTPException(400, "Upload a selfie first (Settings > Avatar).")

    supabase_service.upsert_user(user["id"], skin_analysis_status="analyzing")
    try:
        from services import youcam_service

        # youcam_skin_tone_analysis blocks on a real polling loop (time.sleep)
        # -- offload to a thread so it doesn't stall the FastAPI event loop
        # for every other in-flight request (same pattern as tryon.py).
        result = await _run_blocking(youcam_service.youcam_skin_tone_analysis, selfie_url)
    except Exception as e:
        logger.error(f"Skin tone analysis failed for {user['id']}: {e}")
        supabase_service.upsert_user(user["id"], skin_analysis_status="failed")
        raise HTTPException(502, f"Skin tone analysis failed: {e}")

    # Second, independent YouCam call on the same selfie -- a dermatology-
    # standard classification (Fitzpatrick I-VI) alongside the hex colors
    # above. Non-fatal: the primary skin-tone result already succeeded, so a
    # Fitzpatrick failure shouldn't sink the whole "Analyze my skin" action.
    try:
        fitzpatrick = await _run_blocking(youcam_service.youcam_fitzpatrick_analysis, selfie_url)
        result["fitzpatrick"] = fitzpatrick
    except Exception as e:
        logger.warning(f"Fitzpatrick analysis failed for {user['id']} (non-fatal): {e}")
        result["fitzpatrick"] = None

    # Third, independent call -- measured face shape, grounding the same
    # color_profile.face_shape field color_service's Claude-vision pass
    # currently guesses at from a full photo. Also non-fatal.
    face_shape_result = None
    try:
        face_shape_result = await _run_blocking(youcam_service.youcam_face_shape_analysis, selfie_url)
        result["face_shape"] = face_shape_result
    except Exception as e:
        logger.warning(f"Face shape analysis failed for {user['id']} (non-fatal): {e}")
        result["face_shape"] = None

    from datetime import datetime, timezone

    update_fields = {
        "skin_analysis_result": result,
        "skin_analysis_status": "ready",
        "skin_analysis_source_selfie": selfie_url,
        "skin_analysis_updated_at": datetime.now(timezone.utc).isoformat(),
    }

    # Ground the existing color_profile (Claude-vision guess) in a MEASURED
    # skin-tone hex from YouCam -- this is what makes the YouCam data act
    # structurally across the app (wardrobe badges, outfit combos, Aria),
    # not just something Aria mentions in chat. Merge onto the existing
    # profile rather than replacing it: color_service's Claude pass also
    # supplies body_type/face_shape/hair/confidence that YouCam doesn't.
    from services import color_service

    skin_hex = (result.get("colors") or {}).get("skin_color")
    classification = color_service.classify_season_from_hex(skin_hex)
    profile_update: dict = dict(classification) if classification else {}

    measured_shape = (face_shape_result or {}).get("face_shape")
    if measured_shape:
        profile_update["face_shape"] = measured_shape.lower()
        profile_update["face_shape_source"] = "youcam_measured"

    if profile_update:
        current_profile = row.get("color_profile") or {}
        update_fields["color_profile"] = {**current_profile, **profile_update}

    supabase_service.upsert_user(user["id"], **update_fields)

    from services import analytics_service
    analytics_service.capture(user["id"], "skin_analysis_generated", {
        "colors": result.get("colors"),
        "season_reclassified": bool(classification),
    })

    return result


@router.get("/status")
async def skin_status(user=Depends(current_user)):
    row = supabase_service.get_user(user["id"]) or {}
    return {
        "status": row.get("skin_analysis_status") or "idle",
        "result": row.get("skin_analysis_result"),
        "updated_at": row.get("skin_analysis_updated_at"),
    }
