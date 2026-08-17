"""
Garment image cleaner — turns a messy user photo into a clean studio product shot.

Strategy (Runway-first, rembg fallback):
    1. Try Runway gen4_image to RE-SYNTHESIZE the garment as a clean studio shot.
       Best quality. Costs ~2-5 credits. Requires Runway credits.
    2. If Runway fails (no credits, API error, model rejects image), fall back to
       rembg: removes the background using a U^2-Net segmentation model, then
       composites the garment onto a pure white background.
       Free, runs locally, no network needed after first model download.
    3. If BOTH fail, return the original bytes unchanged. Wardrobe still gets the
       photo, just not cleaned.

The first call to rembg downloads the U^2-Net model (~170MB) into ~/.u2net.
Subsequent calls are fast (~2-3s on CPU).
"""
import io
import logging
from typing import Literal, Optional
from PIL import Image, ImageFilter
import numpy as np

logger = logging.getLogger(__name__)

# Lazy-loaded rembg sessions, cached per model (heavy import + one-time model download).
_rembg_sessions: dict = {}

# u2net_cloth_seg is trained on garments (upper/lower/full body) and is far better for
# clothing, but it erases NON-clothing entirely (jewelry, bags, sunglasses, shoes come
# out blank). So accessories/shoes use a general-purpose object segmenter instead.
_CLOTHING_CATEGORIES = {"tops", "bottoms", "dresses", "outerwear"}
_CLOTH_MODEL = "u2net_cloth_seg"
_GENERAL_MODEL = "isnet-general-use"


def _get_rembg_session(model_name: str = _CLOTH_MODEL):
    """Return a cached rembg session for the given model (one per model)."""
    if model_name not in _rembg_sessions:
        from rembg import new_session
        _rembg_sessions[model_name] = new_session(model_name=model_name)
        logger.info(f"rembg session initialized (model={model_name})")
    return _rembg_sessions[model_name]


def _model_for_category(category: Optional[str]) -> str:
    return _CLOTH_MODEL if (category or "").lower() in _CLOTHING_CATEGORIES else _GENERAL_MODEL


def _opaque_ratio(rgba: Image.Image) -> float:
    """Fraction of pixels with meaningful alpha (>20)."""
    alpha = rgba.getchannel("A")
    hist = alpha.histogram()  # 256 buckets
    visible = sum(hist[21:])
    total = rgba.width * rgba.height
    return visible / total if total else 0.0


_MIN_OPAQUE = 0.003  # below this the cutout is essentially blank


def _apply_alpha_matting(rgba: Image.Image, feather_radius: int = 2, category: Optional[str] = None) -> Image.Image:
    """
    Apply alpha channel matting to smooth edges and remove background color bleed.
    
    WHY: rembg often leaves semi-transparent halos with background color contamination
    around garment edges. This function:
    1. Erodes then dilates the alpha mask to remove weak-alpha fringe pixels (color decontamination)
    2. Applies Gaussian blur to the alpha channel for smooth anti-aliased edges (feathering)
    3. Preserves the RGB channels from the original, preventing color shift
    
    Args:
        rgba: Input RGBA image from rembg
        feather_radius: Gaussian blur radius for edge softening (default 2px)
        category: Optional garment category for category-aware thresholds
                  (e.g., accessories may need less aggressive erosion)
    
    Returns:
        RGBA image with matted alpha channel
    
    Future enhancement: Category-aware thresholds
        - Accessories (jewelry, bags) have fine details that are lost by aggressive erosion
        - Could use MinFilter(1) for accessories vs MinFilter(3) for tops/dresses
        - Would require passing category through the call chain
    """
    # Split channels
    r, g, b, a = rgba.split()
    
    # Color decontamination: erode to remove weak fringe, then dilate to restore edge position
    # This removes semi-transparent pixels that carry background color
    # TODO: category-aware erosion strength (accessories need gentler treatment)
    erode_size = 3  # Could be 1 for accessories, 3 for clothing
    eroded = a.filter(ImageFilter.MinFilter(erode_size))  # shrink mask
    dilated = eroded.filter(ImageFilter.MaxFilter(erode_size))  # expand back
    
    # Edge feathering: Gaussian blur for smooth anti-aliasing
    # WHY: hard segmentation edges look artificial; 2-3px blur creates natural falloff
    feathered = dilated.filter(ImageFilter.GaussianBlur(radius=feather_radius))
    
    # Reconstruct RGBA with the matted alpha channel
    # RGB channels are unchanged - only alpha is refined
    return Image.merge("RGBA", (r, g, b, feathered))


def _cutout_with_model(image_bytes: bytes, model: str, category: Optional[str] = None):
    """
    Run one rembg model with alpha matting and edge refinement.
    Returns (processed RGBA, opaque_ratio) or (None, 0.0).
    """
    from rembg import remove
    session = _get_rembg_session(model)
    rgba = Image.open(io.BytesIO(remove(image_bytes, session=session))).convert("RGBA")
    
    # Apply alpha matting before cropping (works better on full canvas)
    rgba = _apply_alpha_matting(rgba, feather_radius=2, category=category)
    
    bbox = rgba.getbbox()
    if bbox:
        rgba = rgba.crop(bbox)
    return rgba, _opaque_ratio(rgba)


def make_cutout(image_bytes: bytes, category: Optional[str] = None) -> bytes | None:
    """
    Produce a TRANSPARENT PNG cutout for the closet display (NOT for try-on - try-on
    keeps using the white-bg image). Picks the clothing model for garments and a
    general object segmenter for accessories/shoes; if the primary model returns a
    near-empty result, retries with the other model. Returns PNG bytes, or None on
    failure / empty cutout (so the UI falls back to the white-bg image).
    
    WHY the critical fixes:
    1. Occluded-photo detection: rejects photos of people wearing clothes (rembg can't
       remove what's underneath). Prevents transparent cutouts showing body parts.
    2. Alpha matting + feathering: removes background color bleed and smooths edges
       for professional cutout quality.
    3. 768×1024 normalization: consistent aspect ratio across all wardrobe items for
       uniform grid display.
    4. PNG compression level 9: smaller file size without quality loss.
    """
    # CRITICAL FIX #1: Detect occluded photos (person wearing clothes) BEFORE cutout
    # WHY: rembg removes backgrounds, not occlusions. If the source shows a person
    # wearing the garment, the cutout will show transparent body parts underneath,
    # which looks broken. Reject these upfront and let the UI fall back to white-bg.
    try:
        is_clean, problems = verify_clean_garment(image_bytes, content_type="image/jpeg")
        if not is_clean:
            logger.info(f"make_cutout: rejecting occluded photo (category={category}, problems={problems})")
            return None
    except Exception as e:
        # Don't block cutout pipeline on vision check errors
        logger.warning(f"make_cutout: occluded-photo check failed ({e}); proceeding anyway")
    
    primary = _model_for_category(category)
    fallback = _GENERAL_MODEL if primary == _CLOTH_MODEL else _CLOTH_MODEL
    try:
        rgba, ratio = _cutout_with_model(image_bytes, primary, category=category)
        if ratio < _MIN_OPAQUE:
            alt, alt_ratio = _cutout_with_model(image_bytes, fallback, category=category)
            if alt_ratio > ratio:
                rgba, ratio = alt, alt_ratio
        if ratio < _MIN_OPAQUE:
            logger.warning(f"make_cutout: near-empty cutout (category={category}); skipping")
            return None
        
        # CRITICAL FIX #2: Normalize to 768×1024 for consistent wardrobe grid display
        # WHY: cutouts cropped to bounding box have wildly different aspect ratios.
        # The wardrobe grid looks chaotic with some items 3:1 and others 1:3.
        # Standardizing on portrait 3:4 (768×1024) creates uniform tiles.
        rgba = _fit_portrait_3x4_rgba(rgba)
        
        # CRITICAL FIX #3: PNG compression level 9 for smaller file size
        # WHY: cutouts are displayed as <img> tags, not processed further. High
        # compression reduces bandwidth and Supabase storage without visible quality loss.
        out = io.BytesIO()
        rgba.save(out, format="PNG", compress_level=9, optimize=True)
        return out.getvalue()
    except Exception as e:  # noqa: BLE001
        logger.warning(f"make_cutout failed: {type(e).__name__}: {e}")
        return None


CleanMethod = Literal["runway", "rembg", "youcam", "original", "skipped"]


VERIFY_PROMPT = (
    "You are checking a product photo that is supposed to show exactly ONE clothing "
    "item or accessory on a clean plain background, ghost-mannequin / e-commerce style. "
    'Reply with ONLY a JSON object: {"clean": true|false, "problems": ["..."]}. '
    "Set clean=false if the image shows ANY of: a human body part (face, head, neck, "
    "arms, hands, legs, feet, visible skin), a person or mannequin, more than one "
    "distinct garment, or distracting background/clutter/furniture. Otherwise clean=true. "
    "problems = short phrases naming what is wrong (empty list if clean)."
)


def verify_clean_garment(image_bytes: bytes, content_type: str = "image/jpeg") -> tuple[bool, list[str]]:
    """
    Claude-vision check that a cleaned image is a single isolated garment with no
    body parts/background. Returns (is_clean, problems). On any error returns
    (True, []) so a verification hiccup never blocks the wardrobe-add pipeline.
    """
    try:
        import base64
        import json
        import re
        from services.anthropic_service import client, MODEL

        media_type = content_type if content_type in ("image/jpeg", "image/png", "image/webp", "image/gif") else "image/jpeg"
        resp = client.messages.create(
            model=MODEL,
            max_tokens=300,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": media_type,
                                                  "data": base64.standard_b64encode(image_bytes).decode("ascii")}},
                    {"type": "text", "text": VERIFY_PROMPT},
                ],
            }],
        )
        text = "".join(b.text for b in resp.content if hasattr(b, "text")).strip()
        if text.startswith("```"):
            text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
            text = re.sub(r"\n?```\s*$", "", text)
        data = json.loads(text.strip())
        return bool(data.get("clean", True)), [str(p) for p in (data.get("problems") or [])]
    except Exception as e:
        logger.warning(f"verify_clean_garment failed: {type(e).__name__}: {e}")
        return True, []


def _generate_with_verify(prompt: str, ref_uri: str, ref_tag: str, model: str,
                          ratio: str = "720:960", item_label: str = "garment") -> str | None:
    """
    Run a Runway text_to_image cleanup, then Claude-vision verify the result.
    If the result still shows body parts/background, retry ONCE with a
    problem-specific strengthened prompt. Returns the final image URL or None.
    """
    try:
        from services.runway_service import client
        from runwayml import TaskFailedError, TaskTimeoutError
        import httpx
    except Exception as e:
        logger.warning(f"Runway service unavailable: {e}")
        return None

    # gen4 rejects reference images whose width/height ratio is outside [0.5, 2.0]
    # (tall phone photos). Pad the reference into range, else the isolate/clean 400s
    # and every multi-item add fails. Best-effort - fall back to the original on error.
    try:
        from services import image_service, supabase_service
        with httpx.Client(timeout=20.0, follow_redirects=True) as _c:
            _data = _c.get(ref_uri).content
        _padded = image_service.pad_to_ratio_range(_data)
        if _padded != _data:
            ref_uri = supabase_service.upload_to_storage(
                "wardrobe", "padded-refs", _padded, "ref.jpg", "image/jpeg")
    except Exception as e:
        logger.warning(f"ref-ratio normalize failed for '{item_label}': {e}")

    def _gen(p: str) -> str:
        task = client.text_to_image.create(
            model=model,
            prompt_text=p,
            ratio=ratio,
            reference_images=[{"uri": ref_uri, "tag": ref_tag}],
        ).wait_for_task_output(timeout=180)
        return task.output[0]

    try:
        url = _gen(prompt)
    except TaskFailedError as e:
        logger.warning(f"Runway clean failed for '{item_label}': {e.task_details}")
        return None
    except TaskTimeoutError:
        logger.warning(f"Runway clean timed out for '{item_label}'")
        return None
    except Exception as e:
        logger.warning(f"Runway clean error for '{item_label}': {type(e).__name__}: {e}")
        return None

    # Verify + one retry
    try:
        with httpx.Client(timeout=20.0, follow_redirects=True) as c:
            r = c.get(url)
            r.raise_for_status()
        ctype = r.headers.get("content-type", "image/png").split(";")[0].strip()
        clean, problems = verify_clean_garment(r.content, content_type=ctype)
        if not clean:
            logger.info(f"'{item_label}': verify failed ({problems}); retrying once")
            retry_prompt = prompt + (
                f" The previous attempt still showed: {', '.join(problems) or 'body parts/background'}. "
                "Remove ALL of it - absolutely no skin, no flesh, no body parts, no person, "
                "no mannequin, no background; ONLY the isolated garment on pure white."
            )
            try:
                url = _gen(retry_prompt)
            except Exception as e:
                logger.warning(f"'{item_label}': retry failed ({e}); keeping first result")
    except Exception as e:
        logger.warning(f"'{item_label}': verify skipped ({e})")

    return url


def clean_with_rembg(image_bytes: bytes) -> bytes:
    """
    Remove background using rembg. Returns transparent PNG bytes (RGBA).
    The garment floats on whatever background the UI provides.
    """
    from rembg import remove
    session = _get_rembg_session()

    cutout_png = remove(image_bytes, session=session)   # already RGBA PNG
    cutout = Image.open(io.BytesIO(cutout_png)).convert("RGBA")
    cutout = _fit_portrait_3x4_rgba(cutout)

    buf = io.BytesIO()
    cutout.save(buf, format="PNG")
    return buf.getvalue()


def clean_with_youcam(image_url: str) -> bytes | None:
    """Same-vendor alternative to clean_with_rembg -- background removal via
    YouCam's sod task instead of local rembg. Doesn't spend Runway credits.
    Requires a public HTTPS URL (unlike clean_with_rembg, which works on raw
    bytes). Returns transparent PNG bytes, or None if the task or download
    fails -- callers should fall back to rembg or the original on None."""
    from services import youcam_service

    result_url = youcam_service.youcam_background_removal(image_url)
    if not result_url:
        return None
    try:
        import httpx
        with httpx.Client(timeout=20.0, follow_redirects=True) as c:
            r = c.get(result_url)
            r.raise_for_status()
        cutout = Image.open(io.BytesIO(r.content)).convert("RGBA")
        cutout = _fit_portrait_3x4_rgba(cutout)
        buf = io.BytesIO()
        cutout.save(buf, format="PNG")
        return buf.getvalue()
    except Exception as e:
        logger.warning(f"Could not download/process YouCam bg-removal result: {e}")
        return None


def _fit_portrait_3x4_rgba(img: Image.Image) -> Image.Image:
    """Resize + pad to 768x1024 on a fully transparent canvas (RGBA)."""
    target_w, target_h = 768, 1024
    img.thumbnail((target_w, target_h), Image.LANCZOS)
    canvas = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
    x = (target_w - img.width) // 2
    y = (target_h - img.height) // 2
    canvas.paste(img, (x, y), mask=img.split()[3])
    return canvas


def _fit_portrait_3x4(img: Image.Image, background: tuple) -> Image.Image:
    """Resize + pad to 768x1024 on a solid background. Used by the Runway verify loop."""
    target_w, target_h = 768, 1024
    img.thumbnail((target_w, target_h), Image.LANCZOS)
    canvas = Image.new("RGB", (target_w, target_h), background)
    x = (target_w - img.width) // 2
    y = (target_h - img.height) // 2
    if img.mode == "RGBA":
        canvas.paste(img, (x, y), mask=img.split()[3])
    else:
        canvas.paste(img, (x, y))
    return canvas


def clean_with_runway(image_url: str, item_name: str, item_category: str = "tops", model: str = "gen4_image") -> str | None:
    """
    Use Runway to re-synthesize a clean studio shot of the garment.
    Defaults to full-quality gen4_image for best output.
    Returns the URL of the generated image, or None on any error.
    """
    # Aggressive negative-prompted, ghost-mannequin style cleanup.
    # Runway-style models often re-include the model when given a person photo.
    # The fix is to over-specify "ghost mannequin" / "invisible mannequin" which
    # is the actual e-commerce term for "garment shaped like a body but no body".
    prompt = (
        f"Ghost mannequin product photograph of the {item_name} from @garment. "
        f"Invisible mannequin photography style: the garment holds its 3D shape "
        f"as if worn, but there is NO person, NO mannequin, NO head, NO neck, "
        f"NO arms, NO hands, NO legs, NO feet, NO skin tones, NO flesh, NO body "
        f"silhouette visible anywhere. "
        f"Pure white seamless background, centered framing, full garment visible "
        f"from collar to hem, no cropping. Faithful to original colors, fabric, "
        f"texture, embroidery, beadwork, stitching, prints, drape, and silhouette. "
        f"Photorealistic e-commerce catalog product shot, Net-a-Porter / Farfetch / "
        f"Saks Fifth Avenue style, soft even studio lighting, subtle shadow under "
        f"the garment, 8K resolution, ultra sharp detail. {item_category} only on white."
    )
    return _generate_with_verify(prompt, ref_uri=image_url, ref_tag="garment",
                                 model=model, item_label=item_name)


def runway_isolate_item(
    source_image_url: str,
    item_name: str,
    item_category: str = "tops",
    color: str | None = None,
    position: str | None = None,
    model: str = "gen4_image_turbo",
) -> str | None:
    """
    Isolate ONE specific garment from a multi-item photo. Used by the
    multi-item wardrobe-add flow: the same source photo is fed once per item
    with a description targeting that specific piece.

    Returns the URL of the isolated product shot, or None on failure.
    """
    color_clause = f"color {color}, " if color else ""
    position_clause = f" The target item is located {position} in the @source photo." if position else ""

    prompt = (
        f"Ghost mannequin product photograph of the {color_clause}{item_name} "
        f"({item_category}) extracted from the @source photo.{position_clause} "
        f"Isolate ONLY this single garment - remove every other clothing item, "
        f"accessory, person, mannequin, body part, hand, face, skin, flesh, hanger, "
        f"furniture, and background. The garment holds its 3D shape as if worn "
        f"by an invisible mannequin. Pure white seamless background, centered "
        f"framing, full garment visible from top to bottom with no cropping. "
        f"Faithful to the original color, fabric, texture, stitching, and "
        f"silhouette of the target item. Photorealistic e-commerce catalog "
        f"product shot, Net-a-Porter / Farfetch style, soft even studio "
        f"lighting, subtle shadow under the garment, 8K resolution, ultra "
        f"sharp detail."
    )
    return _generate_with_verify(prompt, ref_uri=source_image_url, ref_tag="source",
                                 model=model, item_label=item_name)


def clean_garment_bytes(
    image_bytes: bytes,
    item_name: str,
    item_category: str = "tops",
    item_image_url: str | None = None,
    prefer: Literal["auto", "runway", "rembg", "youcam", "none"] = "auto",
) -> tuple[bytes, CleanMethod, str]:
    """
    Run the cleanup pipeline on raw image bytes.

    Args:
        image_bytes: original image bytes
        item_name:   for the Runway prompt
        item_image_url: optional public URL of the original (Runway needs HTTPS, not bytes).
            If provided AND prefer is 'runway' or 'auto', tries Runway first.
        prefer:
            'auto'   -> try Runway if URL given, else rembg
            'runway' -> only Runway, fallback to original on fail
            'rembg'  -> only rembg
            'youcam' -> YouCam background removal (needs item_image_url), fallback to
                rembg then original. Not part of 'auto' -- opt in explicitly; doesn't
                spend Runway's credit budget, callers can route here deliberately.
            'none'   -> return original unchanged

    Returns: (output_bytes, method_used, content_type)
        content_type is "image/png" for rembg/youcam (transparent), "image/jpeg" for runway/original.
    """
    if prefer == "none":
        return image_bytes, "skipped", "image/jpeg"

    if prefer == "youcam" and item_image_url:
        youcam_cleaned = clean_with_youcam(item_image_url)
        if youcam_cleaned:
            return youcam_cleaned, "youcam", "image/png"
        # Fall through to rembg on failure

    # Try Runway first if a public URL is available
    if prefer in ("auto", "runway") and item_image_url:
        runway_url = clean_with_runway(item_image_url, item_name, item_category)
        if runway_url:
            try:
                import httpx
                with httpx.Client(timeout=20.0, follow_redirects=True) as c:
                    r = c.get(runway_url)
                    r.raise_for_status()
                return r.content, "runway", "image/jpeg"
            except Exception as e:
                logger.warning(f"Could not download Runway result: {e}")
                # Fall through to rembg

    if prefer == "runway":
        return image_bytes, "original", "image/jpeg"

    # rembg path — produces transparent PNG
    try:
        cleaned = clean_with_rembg(image_bytes)
        return cleaned, "rembg", "image/png"
    except Exception as e:
        logger.error(f"rembg failed: {e}")
        return image_bytes, "original", "image/jpeg"
