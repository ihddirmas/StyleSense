"""Try-on, event scene, and animation endpoints."""
import logging
from fastapi import APIRouter, HTTPException, Depends

from pydantic import BaseModel
from models.schemas import TryOnRequest, MultiItemTryOnRequest, EventSceneRequest, AnimateRequest
from services import runway_service, supabase_service, analytics_service, usage_limits, tryon_service
from services.auth_service import current_user
from services.rate_limit import check_cooldown
from services.usage_limits import check_tryon_cap, check_event_scene_cap, check_animate_cap
from services import genblaze_media_service
from services.tryon_serialization import archive_fields, preferred_video_url, serialize_tryon, video_archive_fields
from services.tryon_service import (
    run_blocking as _run_blocking,
    maybe_restore_face as _maybe_restore_face,
    rehost as _rehost,
    ensure_runway_ratio as _ensure_runway_ratio,
    extra_selfies as _extra_selfies,
)
from graphs import prompt_graph


class SaveTryOnRequest(BaseModel):
    tryon_id: str

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/generate")
async def generate_tryon(req: TryOnRequest, user = Depends(current_user)):
    if not req.avatar_selfie_url:
        raise HTTPException(400, "Add a selfie or full-body photo in Avatar Setup first.")
    if "localhost" in req.avatar_selfie_url or "localhost" in req.item_image_url:
        raise HTTPException(400, "URLs must be public HTTPS, not localhost. Upload to Supabase first.")
    check_cooldown(user["id"], "generate", 5)
    check_tryon_cap(user["id"])

    setting = req.setting
    if req.enhance_prompt and setting:
        setting = await _run_blocking(prompt_graph.build_prompt, setting, "manifest")

    model = runway_service.valid_tryon_model(req.model)

    # gen4 rejects reference images with width/height ratio outside [0.5, 2.0]
    # (tall phone selfies). Pad them into range; Gemini is lenient so skip it there.
    selfie_url, item_url = req.avatar_selfie_url, req.item_image_url
    if not runway_service._is_gemini(model):
        selfie_url = await _run_blocking(_ensure_runway_ratio, user["id"], selfie_url)
        item_url = await _run_blocking(_ensure_runway_ratio, user["id"], item_url)

    try:
        result = await _run_blocking(
            runway_service.runway_generate_tryon,
            avatar_url=selfie_url,
            item_url=item_url,
            item_name=req.item_name,
            item_category=req.item_category,
            model=model,
            setting=setting,
            extra_selfie_urls=req.reference_selfie_urls or _extra_selfies(user["id"], req.avatar_selfie_url, model),
        )
    except RuntimeError as e:
        raise HTTPException(500, str(e))

    restored = await _maybe_restore_face(result["image_url"], selfie_url, result["model_used"])
    image_url = await _rehost(user["id"], restored)

    saved = supabase_service.save_tryon_result(
        user_id=user["id"],
        item_id=req.wardrobe_item_id,
        result_url=image_url,
        model_used=result["model_used"],
        prompt_used=result["prompt_used"],
        runway_task_id=result["task_id"],
    )
    analytics_service.capture(user["id"], "tryon_generated", {
        "model_used": result["model_used"], "endpoint": "generate",
    })

    prov = await tryon_service.archive_tryon_image_to_b2(
        user["id"],
        saved["id"],
        image_url,
        model_used=result["model_used"],
        item_ids=[req.wardrobe_item_id] if req.wardrobe_item_id else [],
    )

    return {
        "result_image_url": image_url,
        "result_id": saved["id"],
        "model_used": result["model_used"],
        **archive_fields(prov),
    }


@router.post("/generate-multi")
async def generate_multi_tryon(req: MultiItemTryOnRequest, user = Depends(current_user)):
    try:
        return await tryon_service.run_multi_tryon(
            user_id=user["id"],
            avatar_selfie_url=req.avatar_selfie_url,
            items=req.items,
            model=req.model,
            setting=req.setting,
            enhance_prompt=req.enhance_prompt,
            reference_selfie_urls=req.reference_selfie_urls,
        )
    except RuntimeError as e:
        raise HTTPException(500, str(e))


@router.post("/event-scene")
async def event_scene(req: EventSceneRequest, user = Depends(current_user)):
    check_cooldown(user["id"], "event-scene", 10)
    check_event_scene_cap(user["id"])
    try:
        result = await _run_blocking(
            runway_service.runway_event_scene,
            tryon_url=req.tryon_result_url,
            event_context=req.event_context,
        )
    except RuntimeError as e:
        raise HTTPException(500, str(e))
    supabase_service.record_usage_event(user["id"], "event_scene")
    analytics_service.capture(user["id"], "event_scene_generated")

    event_image_url = await _rehost(user["id"], result["image_url"])

    if req.tryon_result_id:
        supabase_service.update_tryon_event_scene(
            req.tryon_result_id, event_image_url, req.event_context
        )

    return {"event_image_url": event_image_url, "task_id": result["task_id"]}


@router.post("/animate")
async def animate(req: AnimateRequest, user = Depends(current_user)):
    check_cooldown(user["id"], "animate", 30)
    check_animate_cap(user["id"])
    motion = req.motion_prompt
    scene = req.scene
    if req.enhance_prompt and (req.motion_prompt or req.scene):
        combined = " ".join(x for x in [req.scene, req.motion_prompt] if x)
        motion = await _run_blocking(prompt_graph.build_prompt, combined, "video")
        scene = None  # folded into the enhanced motion prompt

    try:
        result = await _run_blocking(
            genblaze_media_service.animate_with_genblaze,
            image_url=req.image_url,
            motion_prompt=motion or "",
            model=runway_service.valid_video_model(req.model),
            scene=scene,
            duration=6,
            user_id=user["id"],
        )
        if not result:
            result = await _run_blocking(
                runway_service.runway_animate,
                image_url=req.image_url,
                motion_prompt=motion,
                model=runway_service.valid_video_model(req.model),
                scene=scene,
            )
    except RuntimeError as e:
        raise HTTPException(500, str(e))
    supabase_service.record_usage_event(user["id"], "animate")
    analytics_service.capture(user["id"], "video_animated", {"model_used": result.get("model_used")})

    b2_video = result.get("video_url") if result.get("b2_archived") else None
    manifest = result.get("manifest_hash")
    playback_url = preferred_video_url({"b2_video_url": b2_video, "result_video_url": result["video_url"]})

    if req.tryon_result_id:
        supabase_service.update_tryon_video(
            req.tryon_result_id,
            result["video_url"],
            result["task_id"],
            b2_video_url=b2_video,
            video_manifest_hash=manifest,
        )

    return {
        "video_url": playback_url,
        "task_id": result["task_id"],
        **video_archive_fields(result),
    }


@router.post("/save")
async def save_tryon(req: SaveTryOnRequest, user = Depends(current_user)):
    row = supabase_service.get_tryon(req.tryon_id)
    if not row or row["user_id"] != user["id"]:
        raise HTTPException(404, "Try-on not found.")
    return serialize_tryon(supabase_service.mark_tryon_saved(req.tryon_id))


@router.get("/recent")
async def recent(limit: int = 12, all: bool = False, user = Depends(current_user)):
    return supabase_service.get_recent_tryons(user["id"], limit, saved_only=not all)


@router.get("/usage-status")
async def usage_status(user = Depends(current_user)):
    is_unlimited = user["id"] in usage_limits.UNLIMITED_TESTER_USER_IDS
    if is_unlimited:
        return {
            "tryon": {"used": 0, "limit": 0},
            "event_scene": {"used": 0, "limit": 0},
            "animate": {"used": 0, "limit": 0},
        }
    tryon_used = supabase_service.count_tryons_this_month(user["id"])
    event_used = supabase_service.count_usage_events_this_month(user["id"], "event_scene")
    animate_used = supabase_service.count_usage_events_this_month(user["id"], "animate")
    return {
        "tryon": {"used": tryon_used, "limit": usage_limits.FREE_TRYON_MONTHLY_LIMIT},
        "event_scene": {"used": event_used, "limit": usage_limits.FREE_EVENT_SCENE_MONTHLY_LIMIT},
        "animate": {"used": animate_used, "limit": usage_limits.FREE_ANIMATE_MONTHLY_LIMIT},
    }
