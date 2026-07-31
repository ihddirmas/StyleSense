"""Multi-item try-on generation pipeline, shared by the direct Studio flow
(`POST /tryon/generate-multi`) and Aria's `generate_tryon` tool -- both need the
same ratio-normalize -> Runway generate -> face-restore -> rehost -> save pipeline.
"""
import asyncio
import io
import logging
import os
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

import httpx
from PIL import Image

from services import runway_service, supabase_service, analytics_service, usage_limits
from services.rate_limit import check_cooldown
from graphs import prompt_graph

logger = logging.getLogger(__name__)
_executor = ThreadPoolExecutor(max_workers=4)

# Optional identity-reinforcement pass after a try-on. Off by default (adds ~5cr +
# ~30s per generation). Enable with FACE_RESTORE=1 in the backend env.
FACE_RESTORE = os.getenv("FACE_RESTORE", "0") == "1"


async def run_blocking(fn, *args, **kwargs):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, lambda: fn(*args, **kwargs))


async def maybe_restore_face(subject_url: str, face_url: Optional[str], model: str) -> str:
    """gen4 identity-reinforcement pass when FACE_RESTORE is enabled.
    Gemini try-ons skip this entirely (single-pass; identity comes from multiple
    selfie references in the try-on itself). Falls back to the original on failure."""
    if runway_service._is_gemini(model) or not FACE_RESTORE or not face_url:
        return subject_url
    restored = await run_blocking(
        runway_service.runway_restore_face, subject_url=subject_url, face_url=face_url
    )
    return restored or subject_url


async def rehost(user_id: str, runway_url: str) -> str:
    """
    Re-host a Runway output URL into Supabase Storage so it never expires.
    Runway's CloudFront URLs are short-lived signed links (the embedded _jwt
    expires in days), which silently breaks saved try-ons/outfit previews.
    Falls back to the raw URL if the download fails so a generation is never lost.
    """
    try:
        return await run_blocking(
            supabase_service.upload_url_to_storage,
            bucket="tryons", user_id=user_id, source_url=runway_url,
        )
    except Exception:
        return runway_url


def ensure_runway_ratio(user_id: str, url: str) -> str:
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


def extra_selfies(user_id: str, primary: str, model: str) -> list:
    """Gemini benefits from several selfie references; fetch the user's other
    selfies (gen4 ignores this). Returns [] when not Gemini or none available."""
    if not runway_service._is_gemini(model):
        return []
    row = supabase_service.get_user(user_id) or {}
    return [s for s in (row.get("selfie_urls") or []) if s and s != primary][:2]


async def run_multi_tryon(
    user_id: str,
    avatar_selfie_url: str,
    items: list,
    model: str = "gen4_image",
    setting: Optional[str] = None,
    enhance_prompt: bool = True,
    reference_selfie_urls: Optional[list] = None,
) -> dict:
    """Generate a composited multi-item try-on. Returns {result_image_url, result_id, model_used}.

    Raises HTTPException(400/402) for invalid input or a hit usage cap, RuntimeError
    if the Runway generation itself fails.
    """
    if not avatar_selfie_url:
        from fastapi import HTTPException
        raise HTTPException(400, "Add a selfie or full-body photo in Avatar Setup first.")
    if not items:
        from fastapi import HTTPException
        raise HTTPException(400, "Need at least one item.")
    if len(items) > 6:
        from fastapi import HTTPException
        raise HTTPException(400, "Max 6 items at once (composite layout limit).")

    check_cooldown(user_id, "generate-multi", 5)
    usage_limits.check_tryon_cap(user_id)

    if enhance_prompt and setting:
        setting = await run_blocking(prompt_graph.build_prompt, setting, "manifest")

    resolved_model = runway_service.valid_tryon_model(model)

    # gen4 needs the selfie ratio in [0.5, 2.0] (the composite is square already).
    selfie_url = avatar_selfie_url
    if not runway_service._is_gemini(resolved_model):
        selfie_url = await run_blocking(ensure_runway_ratio, user_id, selfie_url)

    result = await run_blocking(
        runway_service.runway_generate_multi_tryon,
        avatar_url=selfie_url,
        items=items,
        model=resolved_model,
        setting=setting,
        storage_uploader=supabase_service.upload_to_storage,
        user_id=user_id,
        extra_selfie_urls=reference_selfie_urls or extra_selfies(user_id, avatar_selfie_url, resolved_model),
    )

    restored = await maybe_restore_face(result["image_url"], selfie_url, result["model_used"])
    image_url = await rehost(user_id, restored)

    saved = supabase_service.save_tryon_result(
        user_id=user_id,
        item_id=None,
        result_url=image_url,
        model_used=result["model_used"],
        prompt_used=result["prompt_used"],
        runway_task_id=result["task_id"],
    )
    analytics_service.capture(user_id, "tryon_generated", {
        "model_used": result["model_used"], "endpoint": "generate-multi", "item_count": len(items),
    })

    return {
        "result_image_url": image_url,
        "result_id": saved["id"],
        "model_used": result["model_used"],
    }
