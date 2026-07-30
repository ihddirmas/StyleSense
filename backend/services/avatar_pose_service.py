"""
Stylized full-body editorial-3D avatar generation.

Each user gets one stylized version of themselves matching Aria's editorial
fashion 3D aesthetic. Used as the Studio idle hero + 'before' in the compare
slider. Photoreal try-ons still use the raw selfie for facial accuracy.

Pipeline:
  selfie (Supabase) -> gen4_image w/ @selfie reference -> Supabase rehost ->
    save users.stylized_avatar_url
"""
import asyncio
import logging
import httpx
from io import BytesIO

from runwayml import TaskFailedError, TaskTimeoutError

from services import supabase_service
from services.runway_service import client as runway_client, runway_animate
from services.video_processor import fix_aspect_ratio_and_loop

logger = logging.getLogger(__name__)

# Shared with backend/scripts/animate_admin_stylist.py - both Aria and the
# per-user stylized avatar use the same motion vocabulary so the dashboard
# heroes look like they live in the same world.
# Image-to-video: lead with MOTION (the still already carries the look), refer to
# the subject generically, positive phrasing only. (Runway Image-to-Video guide.)
RAMP_WALK_PROMPT = (
    "The subject walks confidently forward toward the camera in a smooth catwalk "
    "strut with a natural model gait, subtle head movement and gentle hair sway, "
    "as the camera tracks softly. The look, character style and warm grey studio "
    "background from the source image stay consistent. CRITICAL: This must be a seamless "
    "looping video where the LAST FRAME matches the FIRST FRAME exactly so it loops infinitely "
    "smooth without any jump or stutter. Make the ending pose/position identical to the start. "
    "Smooth cinematic 5 second fashion runway clip. 16:9 landscape orientation."
)


# Photorealistic full-body editorial fashion photo, personalized via @selfie.
# (Deliberately NOT 3D/CGI - that read as cartoonish.)
STYLIZED_PROMPT = (
    "Photorealistic full-body editorial fashion photograph of the person from @selfie, "
    "head to feet visible, standing in a confident relaxed pose, looking toward the camera. "
    "The face must be UNMISTAKABLY the same person as @selfie - identical facial features, "
    "facial hair / beard, eyebrows, hairstyle, hair color and skin tone. Do NOT idealize, "
    "beautify, restyle or substitute the face; keep their real likeness exactly. "
    "Wearing a designer minimalist outfit in muted neutral tones. Clean warm grey studio "
    "backdrop, soft cinematic studio lighting with a subtle gold rim light, background in "
    "sharp focus. Natural realistic skin texture with fine detail, sharp focus, "
    "high-resolution fashion magazine quality, shot on a full-frame camera. Elegant, confident."
)

# When a full-body photo exists, anchor the real body/proportions from @body and
# the face/likeness from @selfie (gen4 allows up to 3 references).
STYLIZED_PROMPT_BODY = (
    "Photorealistic full-body editorial fashion photograph, head to feet visible, confident "
    "relaxed pose, looking toward the camera. The face must be UNMISTAKABLY the same person "
    "as @selfie - identical facial features, facial hair / beard, eyebrows, hairstyle, hair "
    "color and skin tone; do NOT idealize, beautify or substitute the face. Keep the real "
    "body shape, height and proportions of the person in @body. Designer minimalist outfit in "
    "muted neutral tones. Clean warm grey studio backdrop, soft cinematic lighting with a "
    "subtle gold rim light, background in sharp focus. Natural realistic skin texture with "
    "fine detail, high-resolution fashion magazine quality, shot on a full-frame camera."
)


async def _verify_video_aspect_ratio(video_bytes: bytes) -> tuple[bool, str]:
    """
    Check if video is 16:9 landscape. Runway sometimes ignores aspect ratio
    requests. Returns (is_valid, reason).
    """
    try:
        # Try to detect aspect ratio via ffmpeg if available
        import subprocess
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0",
             "-show_entries", "stream=width,height", "-of", "csv=p=0", "-"],
            input=video_bytes, capture_output=True, timeout=10,
        )
        if result.returncode == 0:
            w, h = map(int, result.stdout.decode().strip().split(","))
            aspect = w / h if h else 0
            # Accept 16:9 (1.777...) with some tolerance
            if abs(aspect - (16/9)) < 0.05:
                return True, f"✓ {w}x{h} (16:9)"
            else:
                return False, f"Wrong aspect {w}x{h} ({aspect:.2f}), expected 16:9"
        else:
            logger.warning("ffprobe check failed, assuming OK")
            return True, "ffprobe unavailable (skipped check)"
    except Exception as e:
        logger.warning(f"Video aspect check failed: {e}")
        return True, f"Check skipped: {e}"


async def _safe_ref(user_id: str, url: str) -> str:
    """Ensure a reference photo's aspect ratio is within gen4's allowed range (pad if
    needed, re-host the padded copy). Returns the original URL on no-op / any failure."""
    from services import image_service
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as c:
            r = await c.get(url)
            r.raise_for_status()
        padded = image_service.pad_to_ratio_range(r.content)
        if padded is r.content or padded == r.content:
            return url
        return supabase_service.upload_to_storage(
            bucket="selfies", user_id=user_id, file_bytes=padded,
            filename="ref-padded.jpg", content_type="image/jpeg",
        )
    except Exception as e:  # noqa: BLE001
        logger.warning(f"_safe_ref failed for {url}: {e}")
        return url


async def generate_realistic_hero(
    user_id: str,
    selfie_url: str,
    body_url: str | None = None,
    model: str = "gemini_2.5_flash",
) -> dict:
    """
    Realistic, face-preserving Studio hero: manifest the user in their most-recent
    wardrobe outfit, premium studio. Default model is Gemini 2.5 Flash (more polished);
    pass model='gen4_image' for the tagged-reference / body-ref path. Saves
    users.stylized_avatar_url. On-demand only (called by /regenerate-stylized).
    """
    from services import runway_service, image_service

    # Pick an outfit: a recent dress, else recent top + bottom. None -> default look.
    items = supabase_service.get_wardrobe_items(user_id) or []

    def _first(cat):
        return next((i for i in items if (i.get("category") or "").lower() == cat), None)

    dress = _first("dresses")
    chosen = [dress] if dress else [x for x in (_first("tops"), _first("bottoms")) if x]

    garment_url, outfit_name = None, "a tailored minimalist outfit in muted neutral tones"
    if len(chosen) == 1:
        garment_url, outfit_name = chosen[0]["image_url"], chosen[0]["name"]
    elif len(chosen) >= 2:
        comp = runway_service.composite_product_collage([c["image_url"] for c in chosen])
        garment_url = supabase_service.upload_to_storage(
            "tryons", user_id, comp, "hero-outfit.jpg", "image/jpeg")
        outfit_name = " + ".join(c["name"] for c in chosen)

    safe_selfie = await _safe_ref(user_id, selfie_url)
    # Body-type hint from the cached style profile nudges the generated body toward the user.
    prof = (supabase_service.get_user(user_id) or {}).get("color_profile") or {}
    bt = (prof.get("body_type") or "").replace("_", " ").strip()
    body_type = bt if bt and bt != "unknown" else "natural"

    if runway_service._is_gemini(model):
        # Gemini reads images by ORDER and breaks with 3 refs -> garment IMAGE 1, person LAST,
        # NO body ref. Strong face-lock + a body-type hint so it retains face + body better.
        ratio = "832:1248"
        refs = [{"uri": garment_url, "tag": "garment"}, {"uri": safe_selfie, "tag": "selfie"}] if garment_url \
            else [{"uri": safe_selfie, "tag": "selfie"}]
        prompt = (
            f"Photorealistic full-body editorial fashion photograph, the WHOLE body from head to feet. "
            f"{('IMAGE 1 = the ' + outfit_name + ': use ONLY its clothing, ignore any model wearing it. ') if garment_url else ''}"
            f"The LAST image is the real person - recreate THAT exact person wearing the outfit. Their face "
            f"must be IDENTICAL to the last image: same face shape, jawline, facial hair and beard, eyebrows, "
            f"hairline, hairstyle, hair color, skin tone and complexion - do NOT beautify, slim, smooth, age or "
            f"idealize the face. Give them a true-to-life {body_type} build with realistic proportions. "
            f"Premium fashion studio: clean warm grey backdrop, soft cinematic lighting with a subtle gold rim "
            f"light, background in sharp focus. Natural skin texture, magazine quality. Confident standing pose."
        )[:1000]
    else:
        # gen4: tagged refs, selfie + body + garment (max 3).
        ratio = "720:1280"
        refs = [{"uri": safe_selfie, "tag": "selfie"}]
        if body_url and body_url != selfie_url:
            refs.append({"uri": await _safe_ref(user_id, body_url), "tag": "body"})
        if garment_url:
            refs.append({"uri": garment_url, "tag": "garment"})
        body_clause = "with the real body shape and proportions from @body " if len(refs) > 1 and refs[1]["tag"] == "body" else ""
        garment_clause = (
            f"wearing the {outfit_name} from @garment (use ONLY the clothing from @garment, ignore any model in it)"
            if garment_url else f"wearing {outfit_name}"
        )
        prompt = (
            f"Photorealistic full-body editorial fashion photograph of the person from @selfie - preserve their "
            f"exact face, facial hair, eyebrows, hairstyle, hair color and skin tone - {body_clause}{garment_clause}. "
            f"Premium fashion studio: clean warm grey backdrop, soft cinematic lighting with a subtle gold rim "
            f"light, background in sharp focus. Natural realistic skin texture, magazine quality, full-frame "
            f"camera. Confident relaxed pose, head to feet."
        )[:1000]

    try:
        supabase_service.upsert_user(
            user_id, stylized_avatar_status="generating",
            stylized_avatar_source_selfie=f"{selfie_url}|{body_url or ''}|hero|{model}",
        )
    except Exception as e:
        logger.warning(f"Could not mark hero generating: {e}")

    try:
        task = runway_client.text_to_image.create(
            model=model, prompt_text=prompt, ratio=ratio, reference_images=refs[:3],
            seed=runway_service._seed_for(selfie_url),  # consistent face per photo
        ).wait_for_task_output(timeout=240)
    except (TaskFailedError, TaskTimeoutError) as e:
        try:
            supabase_service.upsert_user(user_id, stylized_avatar_status="failed")
        except Exception:
            pass
        raise RuntimeError(f"Hero generation failed: {e}")

    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as c:
        img = await c.get(task.output[0])
        img.raise_for_status()
    permanent_url = supabase_service.upload_to_storage(
        "selfies", user_id, img.content, "hero.jpg", "image/jpeg")

    try:
        supabase_service.upsert_user(
            user_id, stylized_avatar_url=permanent_url, stylized_avatar_status="ready",
            stylized_avatar_source_selfie=f"{selfie_url}|{body_url or ''}|hero|{model}",
        )
    except Exception as e:
        logger.warning(f"Could not save hero url: {e}")
    return {"url": permanent_url}


async def generate_stylized_avatar(
    user_id: str,
    selfie_url: str,
    body_url: str | None = None,
) -> dict:
    """
    Generate a stylized editorial-3D full-body avatar. Uses the face selfie for
    likeness and, when provided, a full-body photo for real body proportions
    (gen4 multi-reference). Persists on the users row. Returns {url, source_selfie}.

    Idempotent: caller is responsible for skipping if a stylized avatar
    already exists for this (selfie, body) source.
    """
    # Idempotence token: busts the cache when either the selfie OR the body photo changes.
    src_token = f"{selfie_url}|{body_url or ''}"

    # Mark generating so the frontend can show a spinner
    try:
        supabase_service.upsert_user(
            user_id,
            stylized_avatar_status="generating",
            stylized_avatar_source_selfie=src_token,
        )
    except Exception as e:
        logger.warning(f"Could not mark stylized_avatar_status (column missing?): {e}")

    if body_url and body_url != selfie_url:
        prompt = STYLIZED_PROMPT_BODY
        # Pad a tall body photo into gen4's allowed ratio range, else it 400s.
        safe_body = await _safe_ref(user_id, body_url)
        references = [{"uri": selfie_url, "tag": "selfie"}, {"uri": safe_body, "tag": "body"}]
    else:
        prompt = STYLIZED_PROMPT
        references = [{"uri": selfie_url, "tag": "selfie"}]

    try:
        task = runway_client.text_to_image.create(
            model="gen4_image",
            prompt_text=prompt,
            ratio="720:1280",
            reference_images=references,
        ).wait_for_task_output(timeout=240)
    except TaskFailedError as e:
        logger.error(f"Stylized avatar gen failed: {e.task_details}")
        try:
            supabase_service.upsert_user(user_id, stylized_avatar_status="failed")
        except Exception:
            pass
        raise RuntimeError(f"Runway gen failed: {e.task_details}")
    except TaskTimeoutError:
        try:
            supabase_service.upsert_user(user_id, stylized_avatar_status="failed")
        except Exception:
            pass
        raise RuntimeError("Stylized avatar generation timed out")

    runway_url = task.output[0]

    # Rehost to Supabase so we have a permanent URL (Runway URLs are JWT-signed
    # and expire). Use 'selfies' bucket since that's what we already have public.
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as c:
        img_resp = await c.get(runway_url)
        img_resp.raise_for_status()

    permanent_url = supabase_service.upload_to_storage(
        bucket="selfies",
        user_id=user_id,
        file_bytes=img_resp.content,
        filename="stylized-avatar.jpg",
        content_type="image/jpeg",
    )

    try:
        supabase_service.upsert_user(
            user_id,
            stylized_avatar_url=permanent_url,
            stylized_avatar_status="ready",
            stylized_avatar_source_selfie=src_token,
        )
    except Exception as e:
        logger.warning(f"Could not save stylized_avatar_url (column missing?): {e}")

    return {"url": permanent_url, "source_selfie": src_token}


async def generate_stylized_video(
    user_id: str,
    stylized_image_url: str,
) -> dict:
    """
    Animate the user's stylized 3D portrait into a 5s editorial catwalk loop.
    Persists on the users row. Returns {url, source} on success, raises on failure.

    ~60cr per call (gen4.5 / veo3.1 image-to-video). Idempotent guard is the
    caller's responsibility - check stylized_avatar_video_source == source
    before calling.
    """
    try:
        supabase_service.upsert_user(
            user_id,
            stylized_avatar_video_status="generating",
            stylized_avatar_video_source=stylized_image_url,
        )
    except Exception as e:
        logger.warning(f"Could not mark stylized_avatar_video_status (column missing?): {e}")

    # Pre-process: pad stylized portrait to 16:9 landscape BEFORE animating.
    # This ensures Runway consistently produces landscape output instead of
    # sometimes following the source portrait aspect ratio.
    from services import image_service
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as c:
            img_resp = await c.get(stylized_image_url)
            img_resp.raise_for_status()
        
        padded_bytes = image_service.pad_to_16_9(img_resp.content)
        
        # Rehost the padded version
        padded_url = supabase_service.upload_to_storage(
            bucket="selfies",
            user_id=user_id,
            file_bytes=padded_bytes,
            filename="stylized-16x9.jpg",
            content_type="image/jpeg",
        )
        logger.info(f"Padded stylized image to 16:9 for user {user_id}")
    except Exception as e:
        logger.warning(f"Failed to pad image, using original: {e}")
        padded_url = stylized_image_url

    # runway_animate is synchronous - run in executor so the bg task doesn't
    # block other async work in the worker.
    loop = asyncio.get_running_loop()
    try:
        # Hero ramp videos are landscape (16:9) - ramp walking is a horizontal
        # motion, not portrait. The Studio "Animate" button still defaults to
        # portrait via runway_animate's signature.
        result = await loop.run_in_executor(
            None,
            lambda: runway_animate(
                padded_url,  # Use padded 16:9 image
                motion_prompt=RAMP_WALK_PROMPT,
                ratio="1280:720",
            ),
        )
    except RuntimeError as e:
        logger.warning(f"Stylized video gen failed: {e}")
        try:
            supabase_service.upsert_user(user_id, stylized_avatar_video_status="failed")
        except Exception:
            pass
        raise

    runway_url = result.get("video_url")
    if not runway_url:
        try:
            supabase_service.upsert_user(user_id, stylized_avatar_video_status="failed")
        except Exception:
            pass
        raise RuntimeError("Runway animate returned no video_url")

    # Rehost to Supabase (Runway video URLs are JWT-signed and expire).
    async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as c:
        v = await c.get(runway_url)
        v.raise_for_status()

    # Verify video is 16:9 landscape (Runway sometimes ignores ratio param)
    is_correct, reason = await _verify_video_aspect_ratio(v.content)
    if not is_correct:
        logger.warning(f"User {user_id} stylized video aspect incorrect: {reason}. Post-processing...")
        # Fix aspect ratio + create seamless palindromic loop in executor
        loop = asyncio.get_running_loop()
        video_bytes = await loop.run_in_executor(
            None,
            lambda: fix_aspect_ratio_and_loop(v.content),
        )
    else:
        logger.info(f"User {user_id} stylized video verified: {reason}")
        video_bytes = v.content

    permanent_url = supabase_service.upload_to_storage(
        bucket="selfies",
        user_id=user_id,
        file_bytes=video_bytes,
        filename="stylized-ramp.mp4",
        content_type="video/mp4",
    )

    try:
        supabase_service.upsert_user(
            user_id,
            stylized_avatar_video_url=permanent_url,
            stylized_avatar_video_status="ready",
            stylized_avatar_video_source=stylized_image_url,
        )
    except Exception as e:
        logger.warning(f"Could not save stylized_avatar_video_url (column missing?): {e}")

    return {"url": permanent_url, "source": stylized_image_url}
