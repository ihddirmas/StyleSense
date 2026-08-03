"""Genblaze orchestration + Backblaze B2 durable storage for generated media.

Hackathon integration (Backblaze Generative AI Media / Genblaze):
- **Genblaze** runs image-to-video (Runway via RunwayProvider) with SHA-256 provenance manifests.
- **Pipeline.ingest** archives try-on stills (from Runway/Supabase) into B2 with ingest provenance.
- Supabase remains the hot CDN for the app; B2 is the durable, verifiable media archive.

Set B2_BUCKET, B2_KEY_ID, B2_APP_KEY (and optional B2_REGION, B2_PUBLIC_URL_BASE).
Enable with GENBLAZE_MEDIA=1 (default on when B2 is configured).
"""
from __future__ import annotations

import logging
import os
from typing import Any, Optional

logger = logging.getLogger(__name__)

_GENBLAZE_ANIMATE = os.getenv("GENBLAZE_ANIMATE", "1").strip().lower() in {"1", "true", "yes", "on"}
_GENBLAZE_INGEST = os.getenv("GENBLAZE_INGEST", "1").strip().lower() in {"1", "true", "yes", "on"}


def is_configured() -> bool:
    if os.getenv("GENBLAZE_MEDIA", "1").strip().lower() in {"0", "false", "no", "off"}:
        return False
    return bool(
        (os.getenv("B2_BUCKET") or os.getenv("B2_BUCKET_NAME") or "").strip()
        and (os.getenv("B2_KEY_ID") or "").strip()
        and (os.getenv("B2_APP_KEY") or "").strip()
    )


def _bucket_name() -> str:
    return (os.getenv("B2_BUCKET") or os.getenv("B2_BUCKET_NAME") or "").strip()


def _storage_sink():
    from genblaze_core.storage.base import KeyStrategy
    from genblaze_core.storage.sink import ObjectStorageSink
    from genblaze_s3 import S3StorageBackend

    preflight = os.getenv("B2_PREFLIGHT", "0").strip().lower() in {"1", "true", "yes", "on"}
    backend = S3StorageBackend.for_backblaze(
        bucket=_bucket_name(),
        region=os.getenv("B2_REGION"),
        key_id=os.getenv("B2_KEY_ID"),
        app_key=os.getenv("B2_APP_KEY"),
        public_url_base=os.getenv("B2_PUBLIC_URL_BASE"),
        preflight=preflight,
    )
    return ObjectStorageSink(backend, key_strategy=KeyStrategy.HIERARCHICAL)


def _media_type_for_url(url: str, default: str) -> str:
    lower = (url or "").lower().split("?")[0]
    if lower.endswith(".mp4"):
        return "video/mp4"
    if lower.endswith(".png"):
        return "image/png"
    if lower.endswith(".webp"):
        return "image/webp"
    return default


def ingest_media_url(
    source_url: str,
    *,
    user_id: str,
    source: str,
    media_type: str,
    metadata: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Copy a generated asset into B2 via Genblaze ingest + provenance manifest."""
    if not is_configured() or not _GENBLAZE_INGEST:
        return {}

    from genblaze_core import Pipeline
    from genblaze_core.models.asset import Asset

    meta = {"user_id": user_id, **(metadata or {})}
    asset = Asset(url=source_url, media_type=media_type)
    result = Pipeline.ingest(
        assets=[asset],
        source=source,
        source_metadata=meta,
        sink=_storage_sink(),
        name=f"stylesense-{source}",
        tenant_id=user_id,
    )
    steps = result.run.steps if result.run else []
    step = steps[0] if steps else None
    durable_url = step.assets[0].url if step and step.assets else source_url
    return {
        "b2_url": durable_url,
        "manifest_hash": result.manifest.canonical_hash,
        "manifest_verified": result.manifest.verify(),
        "sha256": step.assets[0].sha256 if step and step.assets else None,
        "run_id": result.run.run_id if result.run else None,
    }


def ingest_tryon_image(
    user_id: str,
    image_url: str,
    *,
    tryon_id: Optional[str] = None,
    model_used: Optional[str] = None,
    item_ids: Optional[list] = None,
) -> dict[str, Any]:
    return ingest_media_url(
        image_url,
        user_id=user_id,
        source="stylesense-tryon",
        media_type=_media_type_for_url(image_url, "image/jpeg"),
        metadata={
            "kind": "tryon",
            "tryon_id": tryon_id,
            "model_used": model_used,
            "item_ids": item_ids or [],
        },
    )


def _build_motion_prompt(motion_prompt: str, scene: Optional[str]) -> str:
    final_prompt = motion_prompt or (
        "The subject moves naturally and confidently — turning slightly toward camera, "
        "shifting weight, gentle hair movement, ambient breeze, alive eyes blinking. "
        "Cinematic depth of field, hyperrealistic motion, smooth fluid camera, "
        "Fashion editorial film grade, magazine quality 8K motion."
    )
    if scene:
        final_prompt = f"{final_prompt} Set in {scene}."
    return (
        f"{final_prompt} Preserve the subject's face, outfit, body, the background scene "
        "and lighting exactly — only add natural motion."
    )


def _duration_for_model(model: str, duration: int) -> int:
    if model in ("gen4_turbo", "gen3a_turbo"):
        return 5 if duration < 10 else 10
    if model.startswith("veo") and duration not in (4, 6, 8):
        return 6
    return duration


def run_image_to_video_pipeline(
    *,
    user_id: str,
    image_url: str,
    motion_prompt: str = "",
    model: str = "veo3.1",
    ratio: str = "720:1280",
    duration: int = 6,
    scene: Optional[str] = None,
) -> dict[str, Any]:
    """Genblaze Pipeline: Runway image-to-video → B2 sink + provenance manifest."""
    from genblaze_core import Modality, Pipeline
    from genblaze_runway import RunwayProvider

    prompt = _build_motion_prompt(motion_prompt, scene)
    dur = _duration_for_model(model, duration)
    params: dict[str, Any] = {"prompt_image": image_url, "ratio": ratio}

    run, manifest = (
        Pipeline("stylesense-animate", project_id=user_id, tenant_id=user_id)
        .step(
            RunwayProvider(),
            model=model,
            prompt=prompt,
            modality=Modality.VIDEO,
            duration=dur,
            params=params,
        )
        .run(sink=_storage_sink(), timeout=600, max_retries=1)
    )

    step = run.steps[0] if run.steps else None
    video_url = step.assets[0].url if step and step.assets else None
    if not video_url:
        raise RuntimeError("Genblaze animate pipeline returned no video asset")

    return {
        "video_url": video_url,
        "task_id": run.run_id,
        "model_used": model,
        "prompt_used": prompt,
        "manifest_hash": manifest.canonical_hash,
        "manifest_verified": manifest.verify(),
        "b2_archived": True,
    }


def animate_with_genblaze(
    image_url: str,
    motion_prompt: str = "",
    model: str = "veo3.1",
    ratio: str = "720:1280",
    duration: int = 6,
    scene: Optional[str] = None,
    user_id: str = "",
) -> Optional[dict[str, Any]]:
    """Run Genblaze animate when configured; returns None to fall back to runway_service."""
    if not is_configured() or not _GENBLAZE_ANIMATE:
        return None
    try:
        return run_image_to_video_pipeline(
            user_id=user_id,
            image_url=image_url,
            motion_prompt=motion_prompt,
            model=model,
            ratio=ratio,
            duration=duration,
            scene=scene,
        )
    except Exception as exc:
        logger.warning("Genblaze animate failed, falling back to Runway SDK: %s", exc)
        return None
