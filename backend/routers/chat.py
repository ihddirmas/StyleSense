"""Chat: list threads, fetch a thread, send a message (text or shared outfit/try-on)."""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional

from models.schemas import SendMessageRequest
from services.auth_service import current_user
from services import supabase_service
from services.supabase_service import supabase

router = APIRouter()


def _are_friends(user_a: str, user_b: str) -> bool:
    rows = (
        supabase.table("friendships").select("id, status")
        .or_(f"and(requester_id.eq.{user_a},addressee_id.eq.{user_b}),"
             f"and(requester_id.eq.{user_b},addressee_id.eq.{user_a})")
        .eq("status", "accepted")
        .execute().data
    )
    return bool(rows)


@router.get("/threads")
async def list_threads(user = Depends(current_user)):
    """
    Return one entry per friend you've ever messaged with: friend's profile + last message + unread count.
    """
    # Get all messages I'm involved in
    rows = (
        supabase.table("messages").select("*")
        .or_(f"sender_id.eq.{user['id']},recipient_id.eq.{user['id']}")
        .order("created_at", desc=True)
        .execute().data
    )
    threads_by_other: dict = {}
    for m in rows:
        other_id = m["recipient_id"] if m["sender_id"] == user["id"] else m["sender_id"]
        if other_id not in threads_by_other:
            threads_by_other[other_id] = {
                "other_id": other_id,
                "last_message": m,
                "unread": 0,
            }
        # Count unread (messages TO me, no read_at)
        if m["recipient_id"] == user["id"] and m.get("read_at") is None:
            threads_by_other[other_id]["unread"] += 1

    if not threads_by_other:
        return []

    # Hydrate other profiles
    other_ids = list(threads_by_other.keys())
    profiles = supabase.table("profiles").select("id, full_name, email, username, share_code").in_("id", other_ids).execute().data
    profiles_map = {p["id"]: p for p in profiles}

    out = []
    for t in threads_by_other.values():
        out.append({
            "other": profiles_map.get(t["other_id"], {"id": t["other_id"]}),
            "last_message": t["last_message"],
            "unread": t["unread"],
        })
    # Sort by last message time desc
    out.sort(key=lambda x: x["last_message"]["created_at"], reverse=True)
    return out


@router.get("/with/{other_id}")
async def get_thread(other_id: str, limit: int = 100, user = Depends(current_user)):
    """Fetch messages between me and other_id (oldest first), plus the other's profile."""
    rows = (
        supabase.table("messages").select("*")
        .or_(f"and(sender_id.eq.{user['id']},recipient_id.eq.{other_id}),"
             f"and(sender_id.eq.{other_id},recipient_id.eq.{user['id']})")
        .order("created_at", desc=False)
        .limit(limit)
        .execute().data
    )
    other = supabase.table("profiles").select("*").eq("id", other_id).execute().data
    if not other:
        raise HTTPException(404, "User not found")

    # Mark received messages as read
    unread_ids = [m["id"] for m in rows if m["recipient_id"] == user["id"] and m.get("read_at") is None]
    if unread_ids:
        supabase.table("messages").update({"read_at": "now()"}).in_("id", unread_ids).execute()

    # Hydrate shared attachments. outfits + try_on_results now live in Aurora, so
    # fetch them via the supabase_service helpers (not the Supabase client, which
    # still owns messages/profiles/friendships).
    outfit_ids = [m["shared_outfit_id"] for m in rows if m.get("shared_outfit_id")]
    tryon_ids = [m["shared_tryon_id"] for m in rows if m.get("shared_tryon_id")]
    outfits_map = {}
    tryons_map = {}
    for oid in set(outfit_ids):
        o = supabase_service.get_outfit(oid)
        if o:
            outfits_map[o["id"]] = o
    for tid in set(tryon_ids):
        t = supabase_service.get_tryon(tid)
        if t:
            tryons_map[t["id"]] = t

    enriched = []
    for m in rows:
        m["outfit"] = outfits_map.get(m.get("shared_outfit_id"))
        m["tryon"] = tryons_map.get(m.get("shared_tryon_id"))
        enriched.append(m)

    return {"messages": enriched, "other": other[0]}


@router.post("/send")
async def send_message(req: SendMessageRequest, user = Depends(current_user)):
    if req.recipient_id == user["id"]:
        raise HTTPException(400, "Cannot message yourself.")

    if not _are_friends(user["id"], req.recipient_id):
        raise HTTPException(403, "You can only message friends.")

    if not (req.content or req.shared_outfit_id or req.shared_tryon_id or req.shared_image_url):
        raise HTTPException(400, "Message must have content or an attachment.")

    payload = {
        "sender_id": user["id"],
        "recipient_id": req.recipient_id,
        "content": req.content,
        "shared_outfit_id": req.shared_outfit_id,
        "shared_tryon_id": req.shared_tryon_id,
        "shared_image_url": req.shared_image_url,
        "shared_caption": req.shared_caption,
    }
    res = supabase.table("messages").insert(payload).execute()
    return res.data[0]
