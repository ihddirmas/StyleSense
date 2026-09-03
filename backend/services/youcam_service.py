"""All YouCam (Perfect Corp) API calls live here — mirrors runway_service.py's
shape so the two providers are interchangeable from the router layer.

YouCam API Skin AI & Apparel VTO Hackathon: https://youcam-api.devpost.com
docs.perfectcorp.com / yce.perfectcorp.com were unreachable for research (a
real outage on Perfect Corp's docs+signup domain, confirmed from two
independent networks — the API host itself, on separate AWS infrastructure,
is unaffected). Endpoints and payload shapes below are cross-confirmed from
THREE independent real, working, open-source integrations, most recently and
most authoritatively:
- github.com/Cyberman-HZ/LoopLook — a recent, complete, production TypeScript
  client (lib/youcam.ts) covering skin-tone-analysis + cloth-v3, including
  real provider error codes. This is the primary source below.
- github.com/swallace100/Virtual-Try-On-AI-Store-Mirror — apparel VTO, an
  older "cloth" (not "cloth-v3") task variant; kept only as corroboration.
- github.com/nakamura196/zenn-youcam — 20-task survey confirming the
  file-upload flow's shape.

Confirmed facts (agree across all three sources):
- Auth: flat `Authorization: Bearer <API key>` on every call. No RSA signing,
  no separate token exchange — just the API key from the account dashboard.
- Base URL: https://yce-api-01.makeupar.com/s2s/v2.0/
- Response envelope: {status, data: {task_id, task_status, results}, error}.
- Poll GET {same path used to create the task}/{task_id} — the task-type
  slug stays in the URL.
- File upload (when not using a direct URL): POST /file/{feature-slug} ->
  {file_id, requests: [{url, method, headers}]} -> PUT bytes to that url.
- Rate limit: 250 requests / 300s, 5 QPS (per IP and per token).

This implementation uses skin-tone-analysis (returns skin/hair/eye/lip hex
colors) rather than the older wrinkle/pore/acne concern-score endpoint —
LoopLook's real, working code confirms tone analysis, the concern-score
endpoint doesn't have an equally solid source, AND tone data is a more
direct fit for StyleSense: it plugs straight into the same
"what colors flatter you" reasoning color_service.py already does for
Aria, rather than being a bolted-on dermatology report.

VERIFY once real account access exists (see docs/hackathons/YOUCAM_2026.md):
everything above is dual/triple-sourced from real code, not guessed, but
treat the first live call as the actual confirmation.
"""
import logging
import os
import time

import httpx

logger = logging.getLogger(__name__)

_API_KEY = os.getenv("YOUCAM_API_KEY")
_API_BASE = (os.getenv("YOUCAM_API_BASE_URL") or "https://yce-api-01.makeupar.com").rstrip("/") + "/s2s/v2.0"

MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10MB, per LoopLook's exceed_max_filesize handling

# Real provider error codes -> user-facing messages, confirmed from LoopLook's
# providerError() mapping (backend/services/youcam_service.py callers should
# catch RuntimeError and may inspect args[0] for one of these codes).
PROVIDER_ERROR_MESSAGES = {
    "error_pose": "Could not detect a forward-facing standing pose. Try a brighter, unobstructed photo.",
    "error_invalid_src": "The source photo does not show the required body region.",
    "error_invalid_ref": "The garment reference could not be recognized.",
    "error_apply_region_mismatch": "The photo and garment cover different body regions.",
    "error_face_position_invalid": "Center one forward-facing face in even lighting and try again.",
    "error_below_min_image_size": "The image is too small for a reliable result.",
    "exceed_max_filesize": "The image is too large (max 10MB).",
    "error_nsfw_content_detected": "The provider's safety checks blocked this result.",
}


def _require_api_key() -> str:
    # Deferred to call-time (not import-time): this module is imported by
    # aria_graph.py, which loads on every backend startup, so raising here at
    # import would crash the whole server whenever YouCam isn't configured yet.
    if not _API_KEY:
        raise RuntimeError(
            "Missing YOUCAM_API_KEY in backend/.env (see docs/hackathons/YOUCAM_2026.md)."
        )
    return _API_KEY


def _headers(has_body: bool) -> dict:
    h = {"Authorization": f"Bearer {_require_api_key()}"}
    if has_body:
        h["Content-Type"] = "application/json"
    return h


def _friendly_error(code: str) -> str:
    return PROVIDER_ERROR_MESSAGES.get(code, f"YouCam request failed ({code}).")


# ───────────────────────────── FILE UPLOAD ───────────────────────────── #
# Alternative to passing a direct src_file_url -- needed if the source image
# isn't already publicly hosted. Our images always are (Supabase Storage), so
# callers below default to the URL path and only upload as a fallback.

def _upload_file(feature: str, image_bytes: bytes, filename: str, content_type: str) -> str:
    if len(image_bytes) > MAX_FILE_SIZE_BYTES:
        raise RuntimeError(_friendly_error("exceed_max_filesize"))

    with httpx.Client(timeout=30.0) as client:
        slot_resp = client.post(
            f"{_API_BASE}/file/{feature}",
            headers=_headers(has_body=True),
            json={"files": [{
                "content_type": content_type,
                "file_name": filename,
                "file_size": len(image_bytes),
            }]},
        )
        slot_resp.raise_for_status()
        record = slot_resp.json()["data"]["files"][0]
        upload_req = record["requests"][0]

        put_resp = client.request(
            upload_req.get("method", "PUT"),
            upload_req["url"],
            headers=upload_req.get("headers") or {"Content-Type": content_type},
            content=image_bytes,
        )
        put_resp.raise_for_status()

        return record["file_id"]


# ───────────────────────────── TASK CREATE + POLL ───────────────────────────── #

def _create_task_and_poll(
    feature: str,
    payload: dict,
    *,
    timeout: float = 240.0,
    poll_interval: float = 2.0,
) -> dict:
    """POST /task/{feature} to start, then GET /task/{feature}/{task_id} until
    task_status is "success" or "error"/"failed" (or timeout)."""
    create_url = f"{_API_BASE}/task/{feature}"
    with httpx.Client(timeout=30.0) as client:
        create_resp = client.post(create_url, headers=_headers(has_body=True), json=payload)
        create_resp.raise_for_status()
        created = create_resp.json()["data"]
        task_id = created["task_id"]

        poll_url = f"{create_url}/{task_id}"
        deadline = time.time() + timeout
        while time.time() < deadline:
            time.sleep(poll_interval)
            status_resp = client.get(poll_url, headers=_headers(has_body=False))
            status_resp.raise_for_status()
            data = status_resp.json()["data"]
            task_status = data.get("task_status")

            if task_status == "success":
                # The poll response doesn't reliably echo task_id back -- use
                # the one from the create response (confirmed live 2026-08-09).
                data.setdefault("task_id", task_id)
                return data
            if task_status in ("error", "failed"):
                err = data.get("error")
                code = (err.get("code") if isinstance(err, dict) else err) or "processing_failed"
                raise RuntimeError(_friendly_error(code))

    raise RuntimeError(f"YouCam task {task_id} ({feature}) timed out after {timeout}s")


# ───────────────────────────── APPAREL VTO ───────────────────────────── #

def youcam_apparel_tryon(
    user_image_url: str,
    garment_image_url: str,
    garment_category: str = "upper_body",
) -> dict:
    """Generative apparel try-on via the confirmed /task/cloth-v3 endpoint.
    garment_category: upper_body | lower_body | full_body."""
    data = _create_task_and_poll(
        "cloth-v3",
        {
            "src_file_url": user_image_url,
            "ref_file_url": garment_image_url,
            "garment_category": garment_category,
        },
    )
    results = data.get("results") or {}
    image_url = results.get("url")
    if not image_url:
        raise RuntimeError(f"YouCam cloth-v3 task completed with no result URL: {data}")
    return {
        "image_url": image_url,
        "task_id": data.get("task_id"),
        "provider": "youcam",
    }


# ───────────────────────────── SKIN TONE ANALYSIS ───────────────────────────── #

def youcam_skin_tone_analysis(image_url: str, face_angle_strictness: str = "low") -> dict:
    """Run YouCam's skin-tone-analysis on a selfie. Returns skin/hair/eye/lip
    hex colors -- feeds directly into color-season styling logic.

    face_angle_strictness: strict | high | medium | low | flexible. Default
    "low" -- "high" rejected multiple genuinely front-facing test photos with
    error_face_angle_downward / error_face_not_forward_facing (2026-08-17),
    which is an unacceptable failure mode for a live judge demo where the
    selfie is whatever angle they happen to hold their webcam at.
    """
    data = _create_task_and_poll(
        "skin-tone-analysis",
        {"src_file_url": image_url, "face_angle_strictness_level": face_angle_strictness},
    )
    results = data.get("results") or {}
    colors = results.get("color") or {}
    return {
        "colors": {
            "skin_color": colors.get("skin_color"),
            "hair_color": colors.get("hair_color"),
            "eye_color": colors.get("eye_color"),
            "lip_color": colors.get("lip_color"),
        },
        "task_id": data.get("task_id"),
        "provider": "youcam",
    }


# ───────────────────────────── FITZPATRICK SKIN TYPE ───────────────────────────── #
# Contract confirmed 2026-08-17 against docs.perfectcorp.com's live OpenAPI spec
# (the outage noted at the top of this file has since resolved) -- not
# reverse-engineered like the two features above.

FITZPATRICK_LABELS = {
    "I": "Type I — White",
    "II": "Type II — Beige",
    "III": "Type III — Light Brown",
    "IV": "Type IV — Medium Brown",
    "V": "Type V — Dark Brown",
    "VI": "Type VI — Very Dark Brown",
}


def youcam_fitzpatrick_analysis(image_url: str) -> dict:
    """Run YouCam's fitzpatrick-scale-analyzer on a selfie. Returns one of six
    Fitzpatrick skin types (I-VI) -- a dermatology-standard classification
    that complements skin-tone-analysis's hex colors with a second,
    industry-recognized signal for the same "what does your skin tell us"
    read Aria already gives from skin-tone-analysis."""
    data = _create_task_and_poll(
        "fitzpatrick-scale-analyzer",
        {"src_file_url": image_url, "version": "1.0"},
    )
    results = data.get("results") or {}
    scale = results.get("fitzpatrick_scale")
    return {
        "fitzpatrick_type": scale,
        "fitzpatrick_label": FITZPATRICK_LABELS.get(scale),
        "task_id": data.get("task_id"),
        "provider": "youcam",
    }


# ───────────────────────────── BACKGROUND REMOVAL ───────────────────────────── #
# Contract verified live 2026-08-17 -- BasicRunTaskV2 request (src_file_url +
# version), single-url PNG result. Task slug is "sod" (salient object
# detection) on the provider side, not "background-removal" -- confirmed
# from the live OpenAPI path, not guessed.

def youcam_background_removal(image_url: str) -> str | None:
    """Cut a garment out to a transparent PNG via YouCam, as a same-vendor
    alternative to garment_cleaner.py's rembg (local, free but lower
    fidelity) -- doesn't spend Runway's credit budget. Returns the result
    URL (expires in 2 hours) or None on failure."""
    try:
        data = _create_task_and_poll(
            "sod",
            {"src_file_url": image_url, "version": "1.0"},
            timeout=60.0,
        )
        return (data.get("results") or {}).get("url")
    except Exception as e:
        logger.warning(f"YouCam background removal failed for {image_url}: {e}")
        return None


# ───────────────────────────── PHOTO LIGHTING ───────────────────────────── #
# Contract verified live 2026-08-17 -- BasicRunTaskV2 request (src_file_url +
# version), single-url result shape, matching the docs exactly (unlike
# face-attr-analysis below, this one was accurate).

def youcam_photo_lighting(image_url: str) -> str | None:
    """Brighten/correct a selfie's lighting before it's used for color/Kibbe
    vision analysis. Returns the enhanced image URL (host-side, expires in
    2 hours -- callers must use it immediately, not persist it), or None if
    the task fails. Never raises: this is a quality boost for the vision
    call downstream, not a feature the user directly triggers or depends on
    seeing succeed."""
    try:
        data = _create_task_and_poll(
            "lighting",
            {"src_file_url": image_url, "version": "1.0"},
            timeout=60.0,
        )
        return (data.get("results") or {}).get("url")
    except Exception as e:
        logger.warning(f"YouCam photo lighting failed for {image_url}: {e}")
        return None


# ───────────────────────────── FACE SHAPE ───────────────────────────── #
# Request shape verified live 2026-08-17 -- docs.perfectcorp.com's published
# OpenAPI spec for this endpoint (a nested request_id/payload/actions/
# dst_actions structure) does NOT match what the live API actually accepts;
# a real call against it 400s with "InvalidParameters". The flat shape below
# (src_file_id + top-level features[] + top-level face_angle_strictness_level)
# is what a live call confirmed working end-to-end, including polling
# data.results.faceshape on the completed task -- that part of the published
# spec was accurate. face-attr-analysis still requires a file_id (not a
# src_file_url like the other two features above), so this downloads our own
# Supabase-hosted selfie and re-uploads it via _upload_file first.

# ───────────────────────────── SKIN CONCERN ANALYSIS ───────────────────────────── #
# Contract from docs.perfectcorp.com/reference/ai_skin_analysis — wrinkle/pore/
# acne concern scores (ui_score 0-100, higher = healthier). SD actions only;
# do not mix HD and SD dst_actions in one request.

SKIN_CONCERN_ACTIONS = ("wrinkle", "pore", "acne")


def youcam_skin_concern_analysis(image_url: str) -> dict:
    """Run YouCam's skin-analysis task for dermatology-style concern scores."""
    with httpx.Client(timeout=30.0) as client:
        img_resp = client.get(image_url)
        img_resp.raise_for_status()
        image_bytes = img_resp.content

    content_type = "image/png" if image_url.lower().endswith(".png") else "image/jpeg"
    filename = "selfie.png" if content_type == "image/png" else "selfie.jpg"
    file_id = _upload_file("skin-analysis", image_bytes, filename, content_type)

    data = _create_task_and_poll(
        "skin-analysis",
        {
            "src_file_id": file_id,
            "dst_actions": list(SKIN_CONCERN_ACTIONS),
            "format": "json",
        },
        timeout=180.0,
    )
    output = (data.get("results") or {}).get("output") or []
    concerns = []
    for item in output:
        if not isinstance(item, dict):
            continue
        concern_type = item.get("type")
        if concern_type not in SKIN_CONCERN_ACTIONS:
            continue
        concerns.append({
            "type": concern_type,
            "ui_score": item.get("ui_score"),
            "raw_score": item.get("raw_score"),
        })
    return {
        "concerns": concerns,
        "task_id": data.get("task_id"),
        "provider": "youcam",
    }


def youcam_face_shape_analysis(image_url: str) -> dict:
    """Run YouCam's face-attr-analysis on a selfie, requesting only the
    faceShape feature (of 30+ available) -- Kibbe/stylist advice (necklines,
    glasses, earring shapes) cares about face shape, not the full attribute
    set. Returns one of: Triangle, Diamond, Heart, InvTriangle, Oblong,
    Oval, Round, Square, Unknown."""
    with httpx.Client(timeout=30.0) as client:
        img_resp = client.get(image_url)
        img_resp.raise_for_status()
        image_bytes = img_resp.content

    content_type = "image/png" if image_url.lower().endswith(".png") else "image/jpeg"
    filename = "selfie.png" if content_type == "image/png" else "selfie.jpg"
    file_id = _upload_file("face-attr-analysis", image_bytes, filename, content_type)

    data = _create_task_and_poll(
        "face-attr-analysis",
        {
            "src_file_id": file_id,
            "features": ["faceShape"],
            # "high" (the provider default) rejected genuinely front-facing
            # photos during skin-tone-analysis testing (see
            # youcam_skin_tone_analysis) -- same lesson applies here, default
            # to "low" up front instead of relearning it.
            "face_angle_strictness_level": "low",
        },
    )
    results = data.get("results") or {}
    shape = results.get("faceshape")
    return {
        "face_shape": shape if shape and shape != "Unknown" else None,
        "task_id": data.get("task_id"),
        "provider": "youcam",
    }


def format_skin_profile(result: dict | None) -> str:
    """Render a skin-tone analysis result into a compact line for Aria's
    system prompt. Mirrors color_service.format_color_profile /
    kibbe_service.format_kibbe_profile."""
    if not result:
        return "(no skin tone analysis yet — do not reference it)"

    colors = result.get("colors") or {}
    parts = [f"{k.replace('_color', '')}: {v}" for k, v in colors.items() if v]
    if not parts:
        return "(skin tone analysis returned no usable colors)"

    return (
        f"Detected tones (hex): {', '.join(parts)}. Use these alongside the color-season "
        "profile below when explaining whether a garment's color flatters them."
    )
