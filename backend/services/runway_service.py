"""All Runway SDK calls live here.

Verified against docs.dev.runwayml.com (2026-01):
- Image URLs MUST be public HTTPS (not localhost).
- reference_images tags are FREE-FORM strings; reference via @tag in prompt_text.
- Up to 3 reference images per text_to_image call.

Quality strategy (informed by competitor benchmarking):
- Default model is gen4_image (5cr) - higher fidelity than gen4_image_turbo.
- Multi-item try-on uses a composite product flat-lay (one image with all items)
  rather than separate refs - same approach TheNewBlack.ai uses for its results.
- Prompts emphasize cinematic editorial photography with specific lighting, depth,
  and composition cues that produce magazine-quality output.
"""
import io
import os
import hashlib
import logging
import httpx
from PIL import Image
from runwayml import RunwayML, TaskFailedError, TaskTimeoutError

logger = logging.getLogger(__name__)

_API_KEY = os.getenv("RUNWAY_API_KEY") or os.getenv("RUNWAYML_API_SECRET")
if not _API_KEY:
    raise RuntimeError(
        "Missing Runway API key. Set RUNWAY_API_KEY or RUNWAYML_API_SECRET in backend/.env"
    )

client = RunwayML(api_key=_API_KEY)


# ───────────────────────────── MODEL ALLOWLISTS ───────────────────────────── #
# Mirrors frontend/lib/models.ts. Used to validate a user-selected model id and
# fall back to the default rather than passing an unknown/mismatched id to Runway.

# Limited to models the installed runwayml SDK (4.4.0) actually supports.
# Newer API models (gemini_image3_pro, gpt_image_2, seedance2) require an SDK
# upgrade (>=5.x) and Runway plan access, otherwise the task never starts and
# wait_for_task_output polls until timeout.
TRYON_MODELS = {"gen4_image", "gen4_image_turbo", "gemini_2.5_flash"}
VIDEO_MODELS = {"veo3.1", "veo3.1_fast", "gen4_turbo"}

DEFAULT_TRYON_MODEL = "gen4_image"
DEFAULT_VIDEO_MODEL = "veo3.1"


def valid_tryon_model(model: str | None) -> str:
    """Return a valid try-on model id, defaulting if missing/unknown."""
    return model if model in TRYON_MODELS else DEFAULT_TRYON_MODEL


def valid_video_model(model: str | None) -> str:
    """Return a valid video model id, defaulting if missing/unknown."""
    return model if model in VIDEO_MODELS else DEFAULT_VIDEO_MODEL


# ───────────────────────────── PROMPTS ───────────────────────────── #
# Cinematic editorial style prompts. Specific descriptors >>> generic ones.

PROMPT_TRYON_SINGLE = (
    "Full-length editorial fashion photograph of the exact same person from @selfie, wearing the @garment, "
    "standing in a natural confident pose, the ENTIRE body and both legs fully visible head to feet, "
    "framed full-length and NOT cropped at the waist or knees. "
    "The face is an identical match to @selfie: same facial features, bone structure, eyes, nose, lips, "
    "hairline, skin tone and complexion. Do not beautify, stylize, smooth, or alter the face or body proportions. "
    "Render the @garment with accurate color, fabric texture, and a natural true-to-life fit, drape and silhouette. "
    "{setting}. "
    "Photorealistic, true-to-life skin texture, the whole frame in sharp even focus with the background "
    "clearly visible and in focus (deep depth of field), professional fashion photography, natural realistic color."
)

PROMPT_TRYON_MULTI = (
    "Full-length editorial fashion photograph of the exact same person from @selfie, wearing the complete outfit "
    "shown in @products, standing in a natural confident pose, the ENTIRE body and both legs fully visible head to "
    "feet, framed full-length and NOT cropped at the waist or knees. "
    "Render every garment, accessory, watch and footwear from @products exactly as pictured: preserve color, "
    "texture, and a natural true-to-life fit, drape, layering and proportions. "
    "The face is an identical match to @selfie: same facial features, bone structure, eyes, nose, lips, "
    "hairline, skin tone and complexion. Do not beautify, stylize, smooth, or alter the face or body proportions. "
    "{setting}. "
    "Photorealistic, true-to-life skin texture, the whole frame in sharp even focus with the background "
    "clearly visible and in focus (deep depth of field), professional fashion photography, natural realistic color."
)

PROMPT_EVENT_SCENE = (
    "Full-body editorial photograph of the exact same person (@subject) at {event_context}, visible from head "
    "to feet, natural confident pose, the outfit on @subject is the focus. "
    "Preserve the face and outfit from @subject exactly: identical facial features and identity, no changes. "
    "Natural lighting that matches the scene, the background clearly visible and in focus (deep depth of field), "
    "photorealistic, professional fashion editorial, natural realistic color."
)

# Gemini 2.5 Flash Image prompts. Gemini ignores @tags and reads natural-language
# instructions that reference images BY ORDER, and it adopts the LAST image's person as
# the output identity. So the garment/products is IMAGE 1 and the SELFIE is LAST - this
# is critical: when the garment photo shows a model, putting the selfie last keeps the
# user's face (selfie-first regressed this). The prompt also explicitly says to ignore
# any model in IMAGE 1. Keep clothing wording brief - detailed clothing prompts degrade
# face fidelity. (A tight face-crop / dual-reference was tested and rejected: it
# collapses Gemini to a portrait and drops the garment.)
# Runway caps promptText at 1000 chars for ALL models; _fit_prompt() trims the {setting} to fit.
PROMPT_TRYON_SINGLE_GEMINI = (
    "Photorealistic full-body e-commerce try-on photo. "
    "IMAGE 1 = the {item_name} - use ONLY its clothing; IGNORE any model or person shown wearing it. "
    "The LAST image is the STRICT facial and identity reference: ONE real person. "
    "Keep that person's real face EXACTLY as provided - same face shape, jaw, eyes, eyebrows, nose, lips, "
    "skin tone, hairline and hair - with NO alteration, beautifying, smoothing, slimming, ageing or stylising. "
    "The output must be unmistakably the SAME person, their face seamlessly and ultra-realistically integrated. "
    "Never copy the face of any model from IMAGE 1; never invent a new person. "
    "Dress them in the garment with a natural true-to-life fit, correct cut, length and drape. "
    "Whole body head to feet, confident pose, the face large and in sharp focus. "
    "{setting}. Clean premium background in sharp focus, realistic lighting, natural skin texture."
)

PROMPT_TRYON_MULTI_GEMINI = (
    "Photorealistic full-body e-commerce try-on photo. "
    "IMAGE 1 = the outfit - use ONLY its garments, accessories and footwear as pictured; IGNORE any model wearing them. "
    "The LAST image is the STRICT facial and identity reference: ONE real person. "
    "Keep that person's real face EXACTLY as provided - same face shape, jaw, eyes, eyebrows, nose, lips, "
    "skin tone, hairline and hair - with NO alteration, beautifying, smoothing, slimming, ageing or stylising. "
    "The output must be unmistakably the SAME person, their face seamlessly and ultra-realistically integrated. "
    "Never copy the face of any model from IMAGE 1; never invent a new person. "
    "Dress them in every garment with a natural true-to-life fit, correct cut, length, drape and layering. "
    "Whole body head to feet, confident pose, the face large and in sharp focus. "
    "{setting}. Clean premium background in sharp focus, realistic lighting, natural skin texture."
)


def _seed_for(url: str) -> int:
    """Stable per-photo seed so the same selfie reproduces the same identity across
    generations (Runway's seed: same seed + params -> similar result). Changes only
    when the user uploads a new photo (new URL). Range: uint32."""
    return int(hashlib.sha256((url or "").encode()).hexdigest(), 16) % 4294967295


def _is_gemini(model: str) -> bool:
    return model.startswith("gemini")


def _fit_prompt(template: str, *, setting: str, **kwargs) -> str:
    """Format a try-on prompt, trimming {setting} so the total stays under Runway's
    1000-char promptText limit (enforced for ALL models - gen4 too, not just Gemini).
    The trailing identity/quality instructions are always preserved."""
    base = template.format(setting="", **kwargs)
    room = max(0, 1000 - len(base) - 2)
    return template.format(setting=setting[:room], **kwargs)

# Shared default backdrop used by BOTH gen4 and Gemini try-ons when the user gives no
# occasion/scene, and matched to the avatar hero's studio (avatar_pose_service EDITORIAL)
# so the avatar, manifests and video all share ONE consistent background by default.
DEFAULT_SETTING = (
    "in a premium fashion studio with a clean warm grey backdrop, soft cinematic lighting "
    "and a subtle gold rim light, the background tidy and in sharp focus"
)


# ───────────────────────────── HELPERS ───────────────────────────── #

def _to_aspect_ratio(model: str) -> str:
    """Portrait ratio for fashion photos. Model families accept different ratio sets."""
    # gemini_2.5_flash only accepts a fixed list (e.g. 832:1248, 896:1152, 1024:1024).
    if model == "gemini_2.5_flash":
        return "832:1248"
    # gen4_image / gen4_image_turbo portrait
    return "720:1280"


def composite_product_collage(item_image_urls: list[str], width: int = 1024, height: int = 1024) -> bytes:
    """
    Build ONE flat-lay collage from multiple item images. This is the same trick
    TheNewBlack.ai uses to bypass Runway's 3-reference limit and feed the model
    a single, coherent "outfit reference".

    Layout: items arranged in a grid on a clean white background, each centered
    in its cell with margin. JPEG output.
    """
    if not item_image_urls:
        raise ValueError("Need at least one item image")

    # Download
    items = []
    headers = {"User-Agent": "Mozilla/5.0 StyleAI/1.0"}
    with httpx.Client(timeout=20.0, follow_redirects=True, headers=headers) as c:
        for url in item_image_urls:
            r = c.get(url)
            r.raise_for_status()
            items.append(Image.open(io.BytesIO(r.content)).convert("RGBA"))

    # Pick a grid layout. 1=1x1, 2=2x1, 3-4=2x2, 5-6=3x2
    n = len(items)
    if n == 1: cols, rows = 1, 1
    elif n == 2: cols, rows = 2, 1
    elif n <= 4: cols, rows = 2, 2
    else: cols, rows = 3, 2

    canvas = Image.new("RGB", (width, height), (255, 255, 255))
    cell_w = width // cols
    cell_h = height // rows
    pad = 24

    for i, img in enumerate(items[: cols * rows]):
        col = i % cols
        row = i // cols
        # Fit each item in its cell while preserving aspect ratio
        max_w = cell_w - 2 * pad
        max_h = cell_h - 2 * pad
        ratio = min(max_w / img.width, max_h / img.height)
        new_w = max(1, int(img.width * ratio))
        new_h = max(1, int(img.height * ratio))
        resized = img.resize((new_w, new_h), Image.LANCZOS)
        x = col * cell_w + (cell_w - new_w) // 2
        y = row * cell_h + (cell_h - new_h) // 2
        if resized.mode == "RGBA":
            canvas.paste(resized, (x, y), mask=resized.split()[3])
        else:
            canvas.paste(resized, (x, y))

    buf = io.BytesIO()
    canvas.save(buf, format="JPEG", quality=92)
    return buf.getvalue()


# ───────────────────────────── TRY-ON ───────────────────────────── #

def _selfie_refs(avatar_url: str, extra_selfie_urls=None) -> list:
    """Deduped selfie reference list (primary first). Runway caps referenceImages at
    3 total, so with the garment taking one slot we use at most 2 selfies. Multiple
    selfies sharpen Gemini identity."""
    urls, seen = [], set()
    for u in [avatar_url, *(extra_selfie_urls or [])]:
        if u and u not in seen:
            seen.add(u)
            urls.append(u)
    return [{"uri": u, "tag": "selfie"} for u in urls[:2]]


def runway_generate_tryon(
    avatar_url: str,
    item_url: str,
    item_name: str,
    item_category: str = "tops",
    model: str = "gen4_image",
    setting: str | None = None,
    extra_selfie_urls=None,
) -> dict:
    """Generate single-item try-on. Defaults to full-quality gen4_image."""
    if _is_gemini(model):
        # Gemini: garment IMAGE 1 + one or more selfie references after it, identity-led.
        prompt = _fit_prompt(PROMPT_TRYON_SINGLE_GEMINI, item_name=item_name, setting=setting or DEFAULT_SETTING)
        # Garment IMAGE 1, selfie(s) LAST: Gemini adopts the LAST image's person as the
        # output identity, so the selfie must be last (otherwise a model in the garment
        # photo bleeds into the face). The prompt also tells it to ignore any model in IMAGE 1.
        reference_images = [{"uri": item_url, "tag": "garment"}] + _selfie_refs(avatar_url, extra_selfie_urls)
    else:
        prompt = _fit_prompt(PROMPT_TRYON_SINGLE, setting=setting or DEFAULT_SETTING)
        reference_images = [
            {"uri": avatar_url, "tag": "selfie"},
            {"uri": item_url, "tag": "garment"},
        ]

    try:
        task = client.text_to_image.create(
            model=model,
            prompt_text=prompt,
            ratio=_to_aspect_ratio(model),
            reference_images=reference_images,
            seed=_seed_for(avatar_url),  # consistent face per photo across generations
        ).wait_for_task_output(timeout=300)

        return {
            "image_url": task.output[0],
            "task_id": task.id,
            "model_used": model,
            "prompt_used": prompt,
        }
    except TaskFailedError as e:
        logger.error(f"Runway try-on failed: {e.task_details}")
        raise RuntimeError(f"Runway generation failed: {e.task_details}")
    except TaskTimeoutError:
        raise RuntimeError("Generation timed out (5 minutes)")
    except Exception as e:
        # Validation / model / network errors - surface a clean reason.
        logger.error(f"Runway try-on error ({model}): {type(e).__name__}: {e}")
        raise RuntimeError(f"Runway generation failed ({model}): {e}")


def runway_generate_multi_tryon(
    avatar_url: str,
    items: list,
    model: str = "gen4_image",
    setting: str | None = None,
    storage_uploader=None,
    user_id: str | None = None,
    extra_selfie_urls=None,
) -> dict:
    """
    Multi-item try-on. Builds ONE composite product image from all items
    (TheNewBlack approach), uploads to Supabase, then sends to Runway as a
    single 'products' reference. This unlocks any number of items (not just 2)
    AND gives Runway clearer outfit context.

    Args:
        storage_uploader: callable like supabase_service.upload_to_storage
        user_id: required if storage_uploader is provided
    """
    if not items:
        raise ValueError("Need at least one item")

    item_urls = [it["image_url"] for it in items]

    if len(items) == 1:
        # Single item - use the simpler path
        return runway_generate_tryon(
            avatar_url=avatar_url,
            item_url=item_urls[0],
            item_name=items[0].get("name", "item"),
            item_category=items[0].get("category", "tops"),
            model=model,
            setting=setting,
            extra_selfie_urls=extra_selfie_urls,
        )

    # Build composite
    if storage_uploader is None or user_id is None:
        raise ValueError("Multi-item try-on requires storage_uploader + user_id to host the composite")

    collage_bytes = composite_product_collage(item_urls)
    composite_url = storage_uploader(
        bucket="wardrobe", user_id=user_id,
        file_bytes=collage_bytes, filename="products-composite.jpg",
        content_type="image/jpeg",
    )

    if _is_gemini(model):
        prompt = _fit_prompt(PROMPT_TRYON_MULTI_GEMINI, setting=setting or DEFAULT_SETTING)
        # Products IMAGE 1, selfie(s) LAST (Gemini adopts the last image's identity).
        reference_images = [{"uri": composite_url, "tag": "products"}] + _selfie_refs(avatar_url, extra_selfie_urls)
    else:
        prompt = _fit_prompt(PROMPT_TRYON_MULTI, setting=setting or DEFAULT_SETTING)
        reference_images = [
            {"uri": avatar_url, "tag": "selfie"},
            {"uri": composite_url, "tag": "products"},
        ]

    try:
        task = client.text_to_image.create(
            model=model,
            prompt_text=prompt,
            ratio=_to_aspect_ratio(model),
            reference_images=reference_images,
            seed=_seed_for(avatar_url),  # consistent face per photo across generations
        ).wait_for_task_output(timeout=300)

        return {
            "image_url": task.output[0],
            "task_id": task.id,
            "model_used": model,
            "prompt_used": prompt,
            "products_composite_url": composite_url,
        }
    except TaskFailedError as e:
        raise RuntimeError(f"Runway multi-tryon failed: {e.task_details}")
    except TaskTimeoutError:
        raise RuntimeError("Multi-tryon timed out (5 minutes)")
    except Exception as e:
        # Validation / model / network errors - surface a clean reason instead of a
        # raw 500 (which surfaces as "failed to fetch" in the browser).
        logger.error(f"Runway multi-tryon error ({model}): {type(e).__name__}: {e}")
        raise RuntimeError(f"Runway generation failed ({model}): {e}")


# ───────────────────────────── FACE RESTORE ───────────────────────────── #

PROMPT_FACE_RESTORE = (
    "Editorial fashion photograph identical to @subject in every way - same outfit, "
    "same pose, same body, same background, same lighting and framing - but restore the "
    "exact facial identity, features, bone structure, eye shape, and skin tone of the "
    "person in @face. The face must clearly read as the same individual as @face. "
    "Photorealistic, natural skin texture, sharp focus, magazine quality, 8K. "
    "Change nothing except locking the face to @face."
)


def runway_restore_face(subject_url: str, face_url: str, model: str = "gen4_image") -> str | None:
    """
    Identity-reinforcement second pass: re-render a generated try-on while locking
    the user's exact face from their selfie. Returns the restored image URL, or None
    on failure so the caller can keep the original try-on.
    """
    try:
        task = client.text_to_image.create(
            model=model,
            prompt_text=PROMPT_FACE_RESTORE,
            ratio=_to_aspect_ratio(model),
            reference_images=[
                {"uri": subject_url, "tag": "subject"},
                {"uri": face_url, "tag": "face"},
            ],
        ).wait_for_task_output(timeout=300)
        return task.output[0]
    except TaskFailedError as e:
        logger.warning(f"Face restore failed: {e.task_details}")
        return None
    except TaskTimeoutError:
        logger.warning("Face restore timed out")
        return None
    except Exception as e:
        logger.warning(f"Face restore error: {type(e).__name__}: {e}")
        return None


# ───────────────────────────── EVENT SCENE ───────────────────────────── #

def runway_event_scene(tryon_url: str, event_context: str) -> dict:
    """Place subject of a try-on into a scene."""
    prompt = PROMPT_EVENT_SCENE.format(event_context=event_context)

    try:
        task = client.text_to_image.create(
            model="gen4_image",
            prompt_text=prompt,
            ratio="720:1280",
            reference_images=[{"uri": tryon_url, "tag": "subject"}],
        ).wait_for_task_output(timeout=300)
        return {
            "image_url": task.output[0],
            "task_id": task.id,
            "model_used": "gen4_image",
            "prompt_used": prompt,
        }
    except TaskFailedError as e:
        raise RuntimeError(f"Event scene failed: {e.task_details}")
    except TaskTimeoutError:
        raise RuntimeError("Event scene timed out")


# ───────────────────────────── ANIMATE ───────────────────────────── #

def runway_animate(
    image_url: str,
    motion_prompt: str = "",
    model: str = "veo3.1",
    ratio: str = "720:1280",
    duration: int = 6,
    scene: str | None = None,
) -> dict:
    """
    Animate a still image into a short video.

    Default model is veo3.1 - Runway's most realistic image-to-video offering
    (re-routed from Google Veo). Falls back to gen4_turbo automatically if the
    chosen model fails (both are supported by the installed SDK).

    Args:
        ratio: Runway aspect ratio string. Common values: "720:1280" (portrait,
            default - what try-ons use), "1280:720" (landscape - hero ramp videos).
        duration: 5 is the canonical Studio default. veo3.1 only accepts 4/6/8 -
            we silently bump 5 -> 6 for that model.

    Cost: ~60-100 credits per clip depending on model.
    """
    # Cinematic motion prompt - emphasizes preserved background + natural movement
    final_prompt = motion_prompt or (
        "The subject moves naturally and confidently — turning slightly toward camera, "
        "shifting weight, gentle hair movement, ambient breeze, alive eyes blinking. "
        "Cinematic depth of field, hyperrealistic motion, smooth fluid camera, "
        "Fashion editorial film grade, magazine quality 8K motion."
    )
    # Fold an optional scene/background into the prompt and always pin the background
    # so the placed event scene is retained through the motion.
    if scene:
        final_prompt = f"{final_prompt} Set in {scene}."
    final_prompt = (
        f"{final_prompt} Preserve the subject's face, outfit, body, the background scene "
        "and lighting exactly — only add natural motion."
    )

    def _duration_for(m: str) -> int:
        # veo models allow {4, 6, 8}; gen4_turbo/gen3a_turbo allow {5, 10}.
        if m in ("gen4_turbo", "gen3a_turbo"):
            return 5 if duration < 10 else 10
        if m.startswith("veo") and duration not in (4, 6, 8):
            return 6
        return duration

    def _try(m: str):
        return client.image_to_video.create(
            model=m,
            prompt_image=image_url,
            prompt_text=final_prompt,
            ratio=ratio,
            duration=_duration_for(m),
        ).wait_for_task_output(timeout=300)

    try:
        task = _try(model)
        return {
            "video_url": task.output[0],
            "task_id": task.id,
            "model_used": model,
            "prompt_used": final_prompt,
        }
    except TaskFailedError as e:
        # Newer models can be flaky / capacity-constrained. Fall back to gen4_turbo.
        if model != "gen4_turbo":
            logger.warning(f"{model} failed ({e.task_details}); falling back to gen4_turbo")
            try:
                task = _try("gen4_turbo")
                return {
                    "video_url": task.output[0],
                    "task_id": task.id,
                    "model_used": "gen4_turbo (fallback)",
                    "prompt_used": final_prompt,
                }
            except TaskFailedError as e2:
                raise RuntimeError(f"Runway animate failed: {e2.task_details}")
        raise RuntimeError(f"Runway animate failed: {e.task_details}")
    except TaskTimeoutError:
        raise RuntimeError("Animation timed out")
    except Exception as e:
        # Likely a model-not-available error for newer models; auto-fall-back
        if model != "gen4_turbo":
            logger.warning(f"{model} not available ({e}); falling back to gen4_turbo")
            try:
                task = _try("gen4_turbo")
                return {
                    "video_url": task.output[0],
                    "task_id": task.id,
                    "model_used": "gen4_turbo (fallback)",
                    "prompt_used": final_prompt,
                }
            except Exception as e2:
                raise RuntimeError(f"Runway animate failed: {e2}")
        raise RuntimeError(f"Runway animate failed: {e}")


def runway_upload_ephemeral(image_bytes: bytes, content_type: str, name: str = "upload.jpg") -> str:
    """Upload bytes to Runway ephemeral storage. 24h expiry."""
    upload = client.assets.upload(data=image_bytes, content_type=content_type, name=name)
    return upload.uri
