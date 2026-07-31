"""Confirm-and-insert pipeline for wardrobe items detected in a photo.

Shared by the manual "Add to wardrobe" chat flow (`POST /stylist/wardrobe-confirm`)
and Aria's `add_wardrobe_items` tool -- both need the exact same Runway-isolate ->
rehost -> DB-insert pipeline, so it lives here once instead of being duplicated.
"""
import asyncio
import httpx

from models.schemas import DetectedItem, AddMultiFailure
from services import supabase_service
from services.garment_cleaner import runway_isolate_item


async def _process_one(user_id: str, source_image_url: str, item: DetectedItem):
    loop = asyncio.get_running_loop()
    try:
        isolated_url = await loop.run_in_executor(
            None,
            runway_isolate_item,
            source_image_url,
            item.name,
            item.category,
            item.color,
            item.position,
        )
    except Exception as e:
        return None, AddMultiFailure(name=item.name, reason=f"Runway isolate raised: {e}")

    if not isolated_url:
        return None, AddMultiFailure(name=item.name, reason="Runway isolate returned no output")

    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as c:
            r = await c.get(isolated_url)
            r.raise_for_status()
        permanent_url = supabase_service.upload_to_storage(
            bucket="wardrobe",
            user_id=user_id,
            file_bytes=r.content,
            filename=f"chat-{item.name[:20].replace('/', '_')}.jpg",
            content_type="image/jpeg",
        )
    except Exception as e:
        return None, AddMultiFailure(name=item.name, reason=f"Storage rehost failed: {e}")

    try:
        row = supabase_service.insert_wardrobe_item(
            user_id=user_id,
            name=item.name,
            category=item.category,
            image_url=permanent_url,
            occasion=item.occasion or "casual",
            color=item.color,
            brand=item.brand,
            source_url=source_image_url,
            tags=["chat-added"],
            cutout_url=None,
        )
        return row, None
    except Exception as e:
        return None, AddMultiFailure(name=item.name, reason=f"DB insert failed: {e}")


async def confirm_and_add_items(
    user_id: str, source_image_url: str, items: list[DetectedItem]
) -> tuple[list[dict], list[AddMultiFailure], str]:
    """Isolate each item via Runway in parallel, rehost to Supabase, insert to DB.
    Returns (created rows, failures, human-readable summary string)."""
    results = await asyncio.gather(*[_process_one(user_id, source_image_url, it) for it in items])
    created = [row for row, _ in results if row is not None]
    failed = [fail for _, fail in results if fail is not None]

    count = len(created)
    summary = created[0]["name"] if count == 1 else f"{count} items"
    return created, failed, summary
