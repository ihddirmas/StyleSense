"""Supabase Storage + Auth/social client, and the core relational helpers.

Storage (buckets) and the module-level `supabase` client (used for Auth and the
social tables: profiles, friendships, messages) stay on Supabase. The core domain
tables - users, wardrobe_items, try_on_results, outfits - are now backed by Aurora
PostgreSQL via `services.db`. The function signatures here are unchanged so callers
(routers/services) need no edits.
"""
import os
import json
import uuid
import logging
from typing import Optional
from supabase import create_client, Client

from services import db

logger = logging.getLogger(__name__)

_url = os.getenv("SUPABASE_URL")
_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
if not _url or not _key:
    raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend/.env")

supabase: Client = create_client(_url, _key)

DEMO_USER_ID = os.getenv("DEMO_USER_ID", "00000000-0000-0000-0000-000000000001")


# ───────────────────────────── STORAGE ───────────────────────────── #

def upload_to_storage(
    bucket: str,
    user_id: str,
    file_bytes: bytes,
    filename: str,
    content_type: str,
) -> str:
    """
    Upload bytes to a public bucket. Returns the public HTTPS URL Runway can fetch.

    Args:
        bucket: 'wardrobe' | 'selfies' | 'tryons'
        user_id: scopes the path
        file_bytes: raw bytes
        filename: original filename (used to derive extension)
        content_type: MIME type (image/jpeg, image/png, image/webp)
    """
    ext = filename.split(".")[-1].lower() if "." in filename else "jpg"
    if ext == "jpeg":
        ext = "jpg"
    if ext not in ("jpg", "png", "webp", "wav", "mp3", "m4a", "ogg", "mp4", "webm", "mov"):
        raise ValueError(f"Unsupported file extension: {ext}. Use jpg, png, webp, wav, mp3, m4a, ogg, mp4, webm, or mov.")

    storage_path = f"{user_id}/{uuid.uuid4()}.{ext}"

    supabase.storage.from_(bucket).upload(
        path=storage_path,
        file=file_bytes,
        file_options={
            "content-type": content_type,
            "cache-control": "3600",
            "upsert": "false",
        },
    )

    public_url = supabase.storage.from_(bucket).get_public_url(storage_path)
    # Supabase sometimes returns a trailing ?, strip it
    return public_url.rstrip("?")


def upload_url_to_storage(
    bucket: str,
    user_id: str,
    source_url: str,
) -> str:
    """
    Download an external image URL (e.g. scraped Amazon image) and re-host it
    in our Supabase Storage so Runway can fetch it (some retailers block bots).
    """
    import httpx
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
    }
    with httpx.Client(follow_redirects=True, timeout=20.0, headers=headers) as client:
        resp = client.get(source_url)
        resp.raise_for_status()
        content_type = resp.headers.get("content-type", "image/jpeg").split(";")[0].strip()
        if content_type not in ("image/jpeg", "image/png", "image/webp"):
            # Default to jpeg if header is wrong - Pillow check happens elsewhere
            content_type = "image/jpeg"

        # Derive a sensible filename
        filename = source_url.split("/")[-1].split("?")[0] or "scraped.jpg"
        return upload_to_storage(bucket, user_id, resp.content, filename, content_type)


# ============================================================================ #
# Core relational tables below are backed by Aurora PostgreSQL (services.db).
# Signatures are unchanged from the Supabase versions so callers stay the same.
# ============================================================================ #

# ───────────────────────────── WARDROBE ───────────────────────────── #

def insert_wardrobe_item(
    user_id: str,
    name: str,
    category: str,
    image_url: str,
    occasion: str = "casual",
    color: Optional[str] = None,
    brand: Optional[str] = None,
    source_url: Optional[str] = None,
    tags: Optional[list] = None,
    cutout_url: Optional[str] = None,
) -> dict:
    return db.query(
        """
        INSERT INTO wardrobe_items
            (user_id, name, category, occasion, color, brand, image_url, source_url, tags, cutout_url)
        VALUES
            (:user_id, :name, :category, :occasion, :color, :brand, :image_url,
             :source_url, (:tags)::text[], :cutout_url)
        RETURNING *
        """,
        {
            "user_id": user_id,
            "name": name,
            "category": category,
            "occasion": occasion,
            "color": color,
            "brand": brand,
            "image_url": image_url,
            "source_url": source_url,
            "tags": tags or [],
            "cutout_url": cutout_url,
        },
        fetch="one",
    )


def get_wardrobe_items(user_id: str, category: Optional[str] = None, occasion: Optional[str] = None) -> list:
    sql = "SELECT * FROM wardrobe_items WHERE user_id = :user_id"
    params: dict = {"user_id": user_id}
    if category:
        sql += " AND category = :category"
        params["category"] = category
    if occasion:
        sql += " AND occasion = :occasion"
        params["occasion"] = occasion
    sql += " ORDER BY created_at DESC"
    return db.query(sql, params, fetch="all")


def get_wardrobe_item(item_id: str) -> Optional[dict]:
    return db.query("SELECT * FROM wardrobe_items WHERE id = :id", {"id": item_id}, fetch="one")


def delete_wardrobe_item(item_id: str) -> None:
    db.query("DELETE FROM wardrobe_items WHERE id = :id", {"id": item_id}, fetch="none")


# ───────────────────────────── USERS / AVATAR ───────────────────────────── #

# JSONB columns on `users` - dict/list values for these are json-encoded + cast.
_USER_JSONB_COLS = {"selfie_urls", "color_profile", "style_preferences", "body_analysis"}


def upsert_user(user_id: str, **fields) -> dict:
    """INSERT ... ON CONFLICT (id) DO UPDATE, with dynamic columns from **fields."""
    cols = ["id"]
    placeholders = [":id"]
    params: dict = {"id": user_id}
    for key, value in fields.items():
        cols.append(key)
        if key in _USER_JSONB_COLS or isinstance(value, (dict, list)):
            placeholders.append(f"CAST(:{key} AS JSONB)")
            params[key] = json.dumps(value)
        else:
            placeholders.append(f":{key}")
            params[key] = value

    update_cols = [c for c in cols if c != "id"]
    if update_cols:
        set_clause = ", ".join(f"{c} = EXCLUDED.{c}" for c in update_cols)
        set_clause += ", updated_at = NOW()"
        conflict = f"DO UPDATE SET {set_clause}"
    else:
        conflict = "DO NOTHING"

    return db.query(
        f"""
        INSERT INTO users ({", ".join(cols)})
        VALUES ({", ".join(placeholders)})
        ON CONFLICT (id) {conflict}
        RETURNING *
        """,
        params,
        fetch="one",
    )


def ensure_user(user_id: str, email: Optional[str] = None) -> None:
    """
    Idempotently create the Aurora `users` row for an authenticated user.

    Replaces the Supabase handle_new_user() trigger, which can no longer populate
    `users` now that the table lives in Aurora (the trigger still creates the
    Supabase `profiles` row). Called once per request from auth_service.current_user.
    """
    db.query(
        """
        INSERT INTO users (id, email)
        VALUES (:id, :email)
        ON CONFLICT (id) DO NOTHING
        """,
        {"id": user_id, "email": email},
        fetch="none",
    )


def get_user(user_id: str) -> Optional[dict]:
    return db.query("SELECT * FROM users WHERE id = :id", {"id": user_id}, fetch="one")


# ───────────────────────────── TRY-ON RESULTS ───────────────────────────── #

def save_tryon_result(
    user_id: str,
    item_id: Optional[str],
    result_url: str,
    model_used: str,
    prompt_used: str,
    runway_task_id: str,
) -> dict:
    return db.query(
        """
        INSERT INTO try_on_results
            (user_id, wardrobe_item_id, result_image_url, prompt_used, model_used,
             runway_task_id, status)
        VALUES
            (:user_id, :item_id, :result_url, :prompt_used, :model_used,
             :runway_task_id, 'done')
        RETURNING *
        """,
        {
            "user_id": user_id,
            "item_id": item_id,
            "result_url": result_url,
            "prompt_used": prompt_used,
            "model_used": model_used,
            "runway_task_id": runway_task_id,
        },
        fetch="one",
    )


def update_tryon_event_scene(tryon_id: str, event_url: str, event_context: str) -> dict:
    return db.query(
        """
        UPDATE try_on_results
        SET event_scene_url = :event_url, event_context = :event_context
        WHERE id = :id
        RETURNING *
        """,
        {"id": tryon_id, "event_url": event_url, "event_context": event_context},
        fetch="one",
    ) or {}


def update_tryon_video(tryon_id: str, video_url: str, task_id: str) -> dict:
    return db.query(
        """
        UPDATE try_on_results
        SET result_video_url = :video_url, runway_video_task_id = :task_id
        WHERE id = :id
        RETURNING *
        """,
        {"id": tryon_id, "video_url": video_url, "task_id": task_id},
        fetch="one",
    ) or {}


def mark_tryon_saved(tryon_id: str) -> dict:
    """Flip a try-on to saved=true so it shows in history (called when the user saves)."""
    return db.query(
        "UPDATE try_on_results SET saved = TRUE WHERE id = :id RETURNING *",
        {"id": tryon_id},
        fetch="one",
    ) or {}


def get_tryon(tryon_id: str) -> Optional[dict]:
    """Fetch a single try-on by id (used to hydrate shared chat attachments)."""
    return db.query("SELECT * FROM try_on_results WHERE id = :id", {"id": tryon_id}, fetch="one")


def get_recent_tryons(user_id: str, limit: int = 12, saved_only: bool = True) -> list:
    # saved_only=True (default): only explicitly saved try-ons (history/dashboard).
    # saved_only=False: all recent generations (used by the chat share tray).
    saved_clause = " AND saved = TRUE" if saved_only else ""
    return db.query(
        f"""
        SELECT * FROM try_on_results
        WHERE user_id = :user_id{saved_clause}
        ORDER BY created_at DESC
        LIMIT :limit
        """,
        {"user_id": user_id, "limit": limit},
        fetch="all",
    )


# ───────────────────────────── OUTFITS ───────────────────────────── #

def get_outfit(outfit_id: str) -> Optional[dict]:
    return db.query("SELECT * FROM outfits WHERE id = :id", {"id": outfit_id}, fetch="one")


def delete_outfit(outfit_id: str) -> None:
    db.query("DELETE FROM outfits WHERE id = :id", {"id": outfit_id}, fetch="none")


def save_outfit(user_id: str, name: str, item_ids: list, occasion: Optional[str], preview_image_url: Optional[str], notes: Optional[str]) -> dict:
    return db.query(
        """
        INSERT INTO outfits (user_id, name, item_ids, occasion, preview_image_url, notes)
        VALUES (:user_id, :name, (:item_ids)::uuid[], :occasion, :preview_image_url, :notes)
        RETURNING *
        """,
        {
            "user_id": user_id,
            "name": name,
            "item_ids": item_ids or [],
            "occasion": occasion,
            "preview_image_url": preview_image_url,
            "notes": notes,
        },
        fetch="one",
    )


def get_outfits(user_id: str) -> list:
    return db.query(
        "SELECT * FROM outfits WHERE user_id = :user_id ORDER BY created_at DESC",
        {"user_id": user_id},
        fetch="all",
    )


# ───────────────────────────── STYLIST SESSIONS ───────────────────────────── #

def create_stylist_session(user_id: str, messages: list, title: Optional[str] = None) -> dict:
    """Create a new stylist chat session."""
    return db.query(
        """
        INSERT INTO stylist_sessions (user_id, messages, title)
        VALUES (:user_id, CAST(:messages AS JSONB), :title)
        RETURNING *
        """,
        {"user_id": user_id, "messages": json.dumps(messages), "title": title},
        fetch="one",
    )


def get_stylist_sessions(user_id: str, limit: int = 50) -> list:
    """Get all stylist sessions for a user, ordered by most recent."""
    return db.query(
        """
        SELECT * FROM stylist_sessions
        WHERE user_id = :user_id
        ORDER BY updated_at DESC
        LIMIT :limit
        """,
        {"user_id": user_id, "limit": limit},
        fetch="all",
    )


def get_stylist_session(session_id: str) -> Optional[dict]:
    """Get a single stylist session by ID."""
    return db.query(
        "SELECT * FROM stylist_sessions WHERE id = :id",
        {"id": session_id},
        fetch="one",
    )


def update_stylist_session(session_id: str, messages: list, title: Optional[str] = None) -> dict:
    """Update an existing stylist session (append messages or update title)."""
    set_clause = "messages = CAST(:messages AS JSONB), updated_at = NOW()"
    params = {"id": session_id, "messages": json.dumps(messages)}
    if title is not None:
        set_clause += ", title = :title"
        params["title"] = title
    return db.query(
        f"UPDATE stylist_sessions SET {set_clause} WHERE id = :id RETURNING *",
        params,
        fetch="one",
    ) or {}


def delete_stylist_session(session_id: str) -> None:
    """Delete a stylist session."""
    db.query("DELETE FROM stylist_sessions WHERE id = :id", {"id": session_id}, fetch="none")
