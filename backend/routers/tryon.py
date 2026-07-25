"""Try-on, event scene, and animation endpoints."""
import os
import io
import logging
from fastapi import APIRouter, HTTPException, Depends
from concurrent.futures import ThreadPoolExecutor
import asyncio

import httpx
from PIL import Image

from pydantic import BaseModel
from models.schemas import TryOnRequest, MultiItemTryOnRequest, EventSceneRequest, AnimateRequest
from services import runway_service, supabase_service, analytics_service, usage_limits
from services.auth_service import current_user
from services.rate_limit import check_cooldown
from services.usage_limits import check_tryon_cap, check_event_scene_cap, check_animate_cap
from graphs import prompt_graph


class SaveTryOnRequest(BaseModel):
    tryon_id: str

logger = logging.getLogger(__name__)
router = APIRouter()
_executor = ThreadPoolExecutor(max_workers=4)

# Optional identity-reinforcement pass after a try-on. Off by default (adds ~5cr +
# ~30s per generation). Enable with FACE_RESTORE=1 in the backend env.
FACE_RESTORE = os.getenv("FACE_RESTORE", "0") == "1"


async def _run_blocking(fn, *args, **kwargs):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, lambda: fn(*args, **kwargs))


async def _maybe_restore_face(subject_url: str, face_url: str | None, model: str) -> str:
    """gen4 identity-reinforcement pass when FACE_RESTORE is enabled.
    Gemini try-ons skip this entirely (single-pass; identity comes from multiple
    selfie references in the try-on itself). Falls back to the original on failure."""
    if runway_service._is_gemini(model) or not FACE_RESTORE or not face_url:
        return subject_url
    restored = await _run_blocking(
        runway_service.runway_restore_face, subject_url=subject_url, face_url=face_url
    )
    return restored or subject_url


async def _rehost(user_id: str, runway_url: str) -> str:
    """
    Re-host a Runway output URL into Supabase Storage so it never expires.
    Runway's CloudFront URLs are short-lived signed links (the embedded _jwt
    expires in days), which silently breaks saved try-ons/outfit previews.
    Falls back to the raw URL if the download fails so a generation is never lost.
    """
    try:
        return await _run_blocking(
            supabase_service.upload_url_to_storage,
            bucket="tryons", user_id=user_id, source_url=runway_url,
        )
    except Exception:
        return runway_url


def _ensure_runway_ratio(user_id: str, url: str) -> str:
    """gen4 requires every reference image's width/height ratio to be in [0.5, 2.0].
    Tall phone selfies (e.g. ratio 0.46) get rejected with a 400. Pad such images with
    white to the nearest valid ratio, re-host, and return the new URL. Gemini is lenient
    so callers only need this for gen4. Falls back to the original URL on any failure."""
    try:
        data = httpx.get(url, timeout=20, follow_redirects=True).content
        img = Image.open(io.BytesIO(data)).convert("RGB")
        w, h = img.size
        ratio = w / h
        if 0.5 <= ratio <= 2.0:
            return url
        if ratio < 0.5:                       # too tall/narrow -> pad width
            new_w, new_h = int(h * 0.5) + 2, h
            canvas = Image.new("RGB", (new_w, new_h), (255, 255, 255))
            canvas.paste(img, ((new_w - w) // 2, 0))
        else:                                 # too wide -> pad height
            new_w, new_h = w, int(w / 2.0) + 2
            canvas = Image.new("RGB", (new_w, new_h), (255, 255, 255))
            canvas.paste(img, (0, (new_h - h) // 2))
        buf = io.BytesIO()
        canvas.save(buf, format="JPEG", quality=92)
        return supabase_service.upload_to_storage(
            "selfies", user_id, buf.getvalue(), "ref_padded.jpg", "image/jpeg"
        )
    except Exception as e:  # noqa: BLE001
        logger.warning(f"aspect-ratio normalize failed for {url}: {e}")
        return url


def _extra_selfies(user_id: str, primary: str, model: str) -> list:
    """Gemini benefits from several selfie references; fetch the user's other
    selfies (gen4 ignores this). Returns [] when not Gemini or none available."""
    if not runway_service._is_gemini(model):
        return []
    row = supabase_service.get_user(user_id) or {}
    return [s for s in (row.get("selfie_urls") or []) if s and s != primary][:2]


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

    return {
        "result_image_url": image_url,
        "result_id": saved["id"],
        "model_used": result["model_used"],
    }


@router.post("/generate-multi")
async def generate_multi_tryon(req: MultiItemTryOnRequest, user = Depends(current_user)):
    if not req.avatar_selfie_url:
        raise HTTPException(400, "Add a selfie or full-body photo in Avatar Setup first.")
    if not req.items:
        raise HTTPException(400, "Need at least one item.")
    if len(req.items) > 6:
        raise HTTPException(400, "Max 6 items at once (composite layout limit).")
    check_cooldown(user["id"], "generate-multi", 5)
    check_tryon_cap(user["id"])

    setting = req.setting
    if req.enhance_prompt and setting:
        setting = await _run_blocking(prompt_graph.build_prompt, setting, "manifest")

    model = runway_service.valid_tryon_model(req.model)

    # gen4 needs the selfie ratio in [0.5, 2.0] (the composite is square already).
    selfie_url = req.avatar_selfie_url
    if not runway_service._is_gemini(model):
        selfie_url = await _run_blocking(_ensure_runway_ratio, user["id"], selfie_url)

    try:
        result = await _run_blocking(
            runway_service.runway_generate_multi_tryon,
            avatar_url=selfie_url,
            items=req.items,
            model=model,
            setting=setting,
            storage_uploader=supabase_service.upload_to_storage,
            user_id=user["id"],
            extra_selfie_urls=req.reference_selfie_urls or _extra_selfies(user["id"], req.avatar_selfie_url, model),
        )
    except RuntimeError as e:
        raise HTTPException(500, str(e))

    restored = await _maybe_restore_face(result["image_url"], selfie_url, result["model_used"])
    image_url = await _rehost(user["id"], restored)

    saved = supabase_service.save_tryon_result(
        user_id=user["id"],
        item_id=None,
        result_url=image_url,
        model_used=result["model_used"],
        prompt_used=result["prompt_used"],
        runway_task_id=result["task_id"],
    )
    analytics_service.capture(user["id"], "tryon_generated", {
        "model_used": result["model_used"], "endpoint": "generate-multi", "item_count": len(req.items),
    })

    return {
        "result_image_url": image_url,
        "result_id": saved["id"],
        "model_used": result["model_used"],
    }


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

    if req.tryon_result_id:
        supabase_service.update_tryon_video(req.tryon_result_id, result["video_url"], result["task_id"])

    return {"video_url": result["video_url"], "task_id": result["task_id"]}


@router.post("/save")
async def save_tryon(req: SaveTryOnRequest, user = Depends(current_user)):
    row = supabase_service.get_tryon(req.tryon_id)
    if not row or row["user_id"] != user["id"]:
        raise HTTPException(404, "Try-on not found.")
    return supabase_service.mark_tryon_saved(req.tryon_id)


@router.get("/recent")
async def recent(limit: int = 12, all: bool = False, user = Depends(current_user)):
    return supabase_service.get_recent_tryons(user["id"], limit, saved_only=not all)


@router.get("/usage-status")
async def usage_status(user = Depends(current_user)):
    used = supabase_service.count_tryons_this_month(user["id"])
    return {"used": used, "limit": usage_limits.FREE_TRYON_MONTHLY_LIMIT}
