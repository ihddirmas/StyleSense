"""Wardrobe CRUD: upload items, list, delete, and add-from-URL.

Garment cleaning:
    URL-based items default to clean='none' (retailer images are usually already clean).
    Both can be overridden via the `clean` query/form parameter.
"""
import asyncio
import logging
import httpx
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from typing import Optional, Literal
from services import supabase_service, wardrobe_vision_service, outfit_combo_service, kibbe_service
from services.auth_service import current_user
from services.image_service import validate_image_bytes, fetch_image_from_url
from services.garment_cleaner import clean_garment_bytes, clean_with_runway, runway_isolate_item, make_cutout
from services.rate_limit import check_rate_limit_async
from services.usage_limits import check_wardrobe_clean_cap, MAX_ITEMS_PER_ADD_MULTI
from models.schemas import (
    AddWardrobeFromUrl,
    ExtractFromImage,
    DetectedItem,
    DetectItemsResponse,
    DetectFromUrlRequest,
    AddMultiRequest,
    AddMultiResponse,
    AddMultiFailure,
)

logger = logging.getLogger(__name__)

router = APIRouter()
CleanPref = Literal["auto", "runway", "rembg", "none"]


def _generate_cutout(user_id: str, image_url: str, category: Optional[str] = None, image_bytes: Optional[bytes] = None) -> Optional[str]:
    """Best-effort transparent PNG cutout for the closet display. Returns a public URL
    or None (callers fall back to image_url). Pass image_bytes to skip the re-download.
    category picks the segmentation model (clothing vs general object)."""
    try:
        data = image_bytes if image_bytes is not None else httpx.get(
            image_url, timeout=30, follow_redirects=True
        ).content
        png = make_cutout(data, category=category)
        if not png:
            return None
        return supabase_service.upload_to_storage("wardrobe", user_id, png, "cutout.png", "image/png")
    except Exception as e:  # noqa: BLE001
        logger.warning(f"cutout generation failed: {e}")
        return None


@router.get("")
async def list_items(
    category: Optional[str] = None,
    occasion: Optional[str] = None,
    user = Depends(current_user),
):
    try:
        return supabase_service.get_wardrobe_items(user["id"], category, occasion)
    except Exception as exc:
        logger.exception("wardrobe list failed for user %s", user["id"])
        raise HTTPException(
            503,
            "Wardrobe database is unavailable. Check Render DATABASE_URL (Supabase pooler, port 6543).",
        ) from exc


@router.get("/outfit-suggestions")
async def get_outfit_suggestions(user = Depends(current_user)):
    """
    Deterministically pairs wardrobe items by category (top x bottom, plus
    dresses alone, each optionally finished with the best-scoring shoe),
    scores each pairing against the user's color profile AND Kibbe body-type
    reference (when on file), and captions the top few via one Claude call.
    Returns {"suggestions": []} if the wardrobe doesn't have enough pieces to
    pair yet (e.g. no tops, bottoms, or dresses).
    """
    row = supabase_service.get_user(user["id"]) or {}
    color_profile = row.get("color_profile")
    items = supabase_service.get_wardrobe_items(user["id"])

    kibbe_type = (row.get("kibbe_analysis") or {}).get("kibbe_type")
    kibbe_ref = kibbe_service.get_type_reference(kibbe_type) if kibbe_type else None

    loop = asyncio.get_event_loop()
    suggestions = await loop.run_in_executor(
        None, outfit_combo_service.build_outfit_suggestions, items, color_profile, kibbe_ref
    )
    return {"suggestions": suggestions}


@router.post("/upload")
async def upload_item(
    file: UploadFile = File(...),
    name: str = Form(...),
    category: str = Form(...),
    occasion: str = Form("casual"),
    color: Optional[str] = Form(None),
    brand: Optional[str] = Form(None),
    clean: CleanPref = Form("runway"),
    user = Depends(current_user),
):
    """Upload a clothing photo from disk and save to wardrobe.

    Default: clean='runway' - re-synthesizes the garment as a clean studio shot
    using Runway gen4_image_turbo (~3 credits per upload).

    Other clean options:
      - 'auto'  - Runway first, rembg fallback if Runway fails
      - 'rembg' - local cutout only (limited - cannot fix occluded photos)
      - 'none'  - skip cleaning, save original photo as-is
    """
    await check_rate_limit_async(user["id"], "wardrobe-write", limit=30, window_seconds=60)
    content = await file.read()
    try:
        validate_image_bytes(content, file.content_type or "")
    except ValueError as e:
        raise HTTPException(400, str(e))

    # Step 1: upload original first so Runway can fetch it via HTTPS (needed for the prompt)
    try:
        original_url = supabase_service.upload_to_storage(
            bucket="wardrobe",
            user_id=user["id"],
            file_bytes=content,
            filename=file.filename or "item.jpg",
            content_type=file.content_type or "image/jpeg",
        )
    except Exception as e:
        raise HTTPException(500, f"Upload failed: {e}")

    # Step 2: optionally clean (default on). 'runway'/'auto' spend Runway credits and
    # are capped on Free tier; 'rembg' is local-only and free.
    final_url = original_url
    method_used = "skipped"
    if clean != "none":
        if clean in ("runway", "auto"):
            check_wardrobe_clean_cap(user["id"])
        cleaned_bytes, method_used = clean_garment_bytes(
            image_bytes=content,
            item_name=name,
            item_category=category,
            item_image_url=original_url,
            prefer=clean,
        )
        if method_used == "runway":
            supabase_service.record_usage_event(user["id"], "wardrobe_clean")
        if method_used in ("runway", "rembg"):
            try:
                final_url = supabase_service.upload_to_storage(
                    bucket="wardrobe",
                    user_id=user["id"],
                    file_bytes=cleaned_bytes,
                    filename=f"clean-{file.filename or 'item.jpg'}",
                    content_type="image/jpeg",
                )
            except Exception as e:
                # Cleaning succeeded but storage upload failed - keep original
                final_url = original_url
                method_used = f"original (clean upload failed: {e})"

    item = supabase_service.insert_wardrobe_item(
        user_id=user["id"],
        name=name,
        category=category,
        image_url=final_url,
        occasion=occasion,
        color=color,
        brand=brand,
        cutout_url=None,  # cutouts disabled - the closet grid uses the clean image_url
    )
    item["clean_method"] = method_used
    item["original_url"] = original_url if final_url != original_url else None
    return item


@router.post("/from-url")
async def add_from_url(req: AddWardrobeFromUrl, user = Depends(current_user)):
    """Add item by re-hosting a remote image URL into our Supabase Storage.

    Cleaning is OFF by default for URL items because retailer images (Amazon, Uniqlo,
    etc.) are usually already clean product shots. Pass clean='auto' on the request
    body to force cleaning if the source image is messy.
    """
    await check_rate_limit_async(user["id"], "wardrobe-write", limit=30, window_seconds=60)
    try:
        original_url = supabase_service.upload_url_to_storage(
            bucket="wardrobe",
            user_id=user["id"],
            source_url=req.image_url,
        )
    except Exception as e:
        raise HTTPException(400, f"Could not download image from URL: {e}")

    final_url = original_url
    method_used = "skipped"
    clean_pref = (req.clean or "none")  # default OFF for URL-based
    if clean_pref != "none":
        if clean_pref in ("runway", "auto"):
            check_wardrobe_clean_cap(user["id"])
        try:
            import httpx
            with httpx.Client(timeout=20.0, follow_redirects=True) as c:
                r = c.get(original_url)
                r.raise_for_status()
            cleaned_bytes, method_used = clean_garment_bytes(
                image_bytes=r.content,
                item_name=req.name,
                item_category=req.category,
                item_image_url=original_url,
                prefer=clean_pref,
            )
            if method_used == "runway":
                supabase_service.record_usage_event(user["id"], "wardrobe_clean")
            if method_used in ("runway", "rembg"):
                final_url = supabase_service.upload_to_storage(
                    bucket="wardrobe",
                    user_id=user["id"],
                    file_bytes=cleaned_bytes,
                    filename="clean.jpg",
                    content_type="image/jpeg",
                )
        except Exception as e:
            final_url = original_url
            method_used = f"original (clean failed: {e})"

    item = supabase_service.insert_wardrobe_item(
        user_id=user["id"],
        name=req.name,
        category=req.category,
        image_url=final_url,
        occasion=req.occasion or "casual",
        color=req.color,
        brand=req.brand,
        source_url=req.source_url or req.image_url,
        tags=req.tags,
        cutout_url=None,  # cutouts disabled - the grid uses the clean image_url
    )
    item["clean_method"] = method_used
    item["original_url"] = original_url if final_url != original_url else None
    return item


@router.post("/extract-from-image")
async def extract_from_image(req: ExtractFromImage, user = Depends(current_user)):
    """
    Take any image (e.g. a friend's shared try-on or outfit preview), run the
    Runway garment cleaner on it to isolate the clothing, and save to wardrobe.
    Used by the chat "Save to my wardrobe" button.
    """
    # Use Runway re-synthesis with full quality (gen4_image) for the cleanest extraction
    check_wardrobe_clean_cap(user["id"])
    cleaned_url = clean_with_runway(
        image_url=req.image_url,
        item_name=req.name,
        item_category=req.category,
        model="gen4_image",
    )
    if not cleaned_url:
        raise HTTPException(500, "Could not extract garment. Try again or upload manually.")
    supabase_service.record_usage_event(user["id"], "wardrobe_clean")

    # Re-host the Runway-generated image to our Supabase Storage (so it doesn't expire)
    try:
        import httpx
        with httpx.Client(timeout=30.0, follow_redirects=True) as c:
            r = c.get(cleaned_url)
            r.raise_for_status()
        permanent_url = supabase_service.upload_to_storage(
            bucket="wardrobe", user_id=user["id"],
            file_bytes=r.content, filename="extracted.jpg",
            content_type="image/jpeg",
        )
    except Exception as e:
        raise HTTPException(500, f"Could not save extracted image: {e}")

    item = supabase_service.insert_wardrobe_item(
        user_id=user["id"],
        name=req.name,
        category=req.category,
        image_url=permanent_url,
        occasion=req.occasion or "casual",
        source_url=req.image_url,
        tags=["extracted-from-friend"],
        cutout_url=None,  # cutouts disabled - the grid uses the clean image_url
    )
    item["clean_method"] = "runway-extract"
    return item


@router.post("/detect-items", response_model=DetectItemsResponse)
async def detect_items(
    file: UploadFile = File(...),
    user = Depends(current_user),
):
    """
    Multi-item detection: upload one photo, get back the rehosted public URL +
    a list of detected garments (~$0.01, Claude vision, no Runway spend).

    Frontend uses this to decide between the existing single-item flow (1
    detection) and the new multi-item review checklist (>=2 detections).
    """
    content = await file.read()
    try:
        validate_image_bytes(content, file.content_type or "")
    except ValueError as e:
        raise HTTPException(400, str(e))

    try:
        image_url = supabase_service.upload_to_storage(
            bucket="wardrobe",
            user_id=user["id"],
            file_bytes=content,
            filename=file.filename or "multi.jpg",
            content_type=file.content_type or "image/jpeg",
        )
    except Exception as e:
        raise HTTPException(500, f"Upload failed: {e}")

    detected_raw = wardrobe_vision_service.detect_items_from_bytes(
        content, file.content_type or "image/jpeg"
    )
    detected = [DetectedItem(**d) for d in detected_raw]
    return DetectItemsResponse(image_url=image_url, detected=detected)


@router.post("/detect-items-url", response_model=DetectItemsResponse)
async def detect_items_url(req: DetectFromUrlRequest, user = Depends(current_user)):
    """Same as /detect-items but from an image URL (pasted product/image link).
    Re-hosts the image, detects garments, and returns the rehosted URL + detections.
    The frontend then routes through the same review checklist + /add-multi (which
    isolates each garment on a clean background)."""
    try:
        content, ctype = fetch_image_from_url(req.image_url)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(400, f"Could not download image from URL: {e}")

    try:
        image_url = supabase_service.upload_to_storage(
            bucket="wardrobe", user_id=user["id"], file_bytes=content,
            filename="from-url.jpg", content_type=ctype,
        )
    except Exception as e:
        raise HTTPException(500, f"Upload failed: {e}")

    detected = [DetectedItem(**d) for d in wardrobe_vision_service.detect_items_from_bytes(content, ctype)]
    return DetectItemsResponse(image_url=image_url, detected=detected)


@router.post("/add-multi", response_model=AddMultiResponse)
async def add_multi(req: AddMultiRequest, user = Depends(current_user)):
    """
    Per-item Runway isolation + DB insert. Items run in parallel so total
    wall-time is one Runway call (~30s) regardless of count. Partial success
    is fine: failures come back in the `failed` list, successes in `created`.

    Cost: ~2cr per item (gen4_image_turbo).
    """
    if not req.items:
        raise HTTPException(400, "items list is empty")
    if len(req.items) > MAX_ITEMS_PER_ADD_MULTI:
        raise HTTPException(400, f"Too many items in one batch (max {MAX_ITEMS_PER_ADD_MULTI}).")
    # Weighted by item count -- add-multi can create up to MAX_ITEMS_PER_ADD_MULTI rows
    # in one call, so it should debit the same "wardrobe-write" budget proportionally
    # instead of costing the same 1 unit as a single-item upload.
    await check_rate_limit_async(user["id"], "wardrobe-write", limit=30, window_seconds=60, cost=len(req.items))
    check_wardrobe_clean_cap(user["id"], requested=len(req.items))

    async def _process_one(item: DetectedItem):
        loop = asyncio.get_running_loop()
        # runway_isolate_item is synchronous (uses the SDK's sync client) - run
        # in the default executor so all items go in parallel.
        try:
            isolated_url = await loop.run_in_executor(
                None,
                runway_isolate_item,
                req.source_image_url,
                item.name,
                item.category,
                item.color,
                item.position,
            )
        except Exception as e:
            return None, AddMultiFailure(name=item.name, reason=f"Runway isolate raised: {e}")

        if not isolated_url:
            return None, AddMultiFailure(name=item.name, reason="Runway isolate returned no output")

        # Re-host to Supabase (Runway URLs are short-lived JWTs)
        try:
            import httpx
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as c:
                r = await c.get(isolated_url)
                r.raise_for_status()
            permanent_url = supabase_service.upload_to_storage(
                bucket="wardrobe",
                user_id=user["id"],
                file_bytes=r.content,
                filename=f"isolated-{item.name[:20].replace('/', '_')}.jpg",
                content_type="image/jpeg",
            )
        except Exception as e:
            return None, AddMultiFailure(name=item.name, reason=f"Storage rehost failed: {e}")

        try:
            row = supabase_service.insert_wardrobe_item(
                user_id=user["id"],
                name=item.name,
                category=item.category,
                image_url=permanent_url,
                occasion=item.occasion or "casual",
                color=item.color,
                brand=item.brand,
                source_url=req.source_image_url,
                tags=["multi-item-detected"],
                cutout_url=None,  # cutouts disabled - the grid uses the clean image_url
            )
            return row, None
        except Exception as e:
            return None, AddMultiFailure(name=item.name, reason=f"DB insert failed: {e}")

    results = await asyncio.gather(*[_process_one(it) for it in req.items])
    created = [row for row, _ in results if row is not None]
    failed = [fail for _, fail in results if fail is not None]
    for _ in req.items:
        supabase_service.record_usage_event(user["id"], "wardrobe_clean")
    return AddMultiResponse(created=created, failed=failed)


@router.delete("/{item_id}")
async def delete_item(item_id: str, user = Depends(current_user)):
    # RLS would block the delete anyway, but verify ownership defensively
    item = supabase_service.get_wardrobe_item(item_id)
    if not item:
        raise HTTPException(404, "Not found")
    if item["user_id"] != user["id"]:
        raise HTTPException(403, "Not your item")
    supabase_service.delete_wardrobe_item(item_id)
    return {"deleted": True}
