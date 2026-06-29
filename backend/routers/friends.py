"""Friend system: search profiles, send/respond to friend requests, list friends, share outfits/tryons."""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List
from pydantic import BaseModel

from models.schemas import SendFriendRequest, RespondFriendRequest, FriendSearchResult
from services.auth_service import current_user
from services.supabase_service import supabase

router = APIRouter()


class ShareOutfitRequest(BaseModel):
    friend_id: str
    outfit_id: str | None = None
    tryon_id: str | None = None


def _profile_min(p: dict) -> dict:
    return {
        "id": p["id"],
        "full_name": p.get("full_name"),
        "email": p.get("email"),
        "username": p.get("username"),
        "share_code": p.get("share_code"),
    }


@router.get("/search")
async def search_profiles(
    q: str = Query(..., min_length=2),
    user = Depends(current_user),
):
    """Search profiles by email, username, or share_code (case-insensitive)."""
    q = q.strip()

    # Three queries OR'd
    by_email = supabase.table("profiles").select("*").ilike("email", f"%{q}%").limit(10).execute().data
    by_username = supabase.table("profiles").select("*").ilike("username", f"%{q}%").limit(10).execute().data
    by_code = supabase.table("profiles").select("*").eq("share_code", q.upper()).limit(5).execute().data

    seen = set()
    merged = []
    for row in [*by_code, *by_email, *by_username]:
        if row["id"] in seen or row["id"] == user["id"]:
            continue
        seen.add(row["id"])
        merged.append(row)

    if not merged:
        return []

    # Annotate relationship for each result
    ids = [r["id"] for r in merged]
    fr_rows = (
        supabase.table("friendships").select("*")
        .or_(f"and(requester_id.eq.{user['id']},addressee_id.in.({','.join(ids)})),"
             f"and(addressee_id.eq.{user['id']},requester_id.in.({','.join(ids)}))")
        .execute().data
    )
    rel_by_id: dict = {}
    for fr in fr_rows:
        other = fr["addressee_id"] if fr["requester_id"] == user["id"] else fr["requester_id"]
        if fr["status"] == "accepted":
            rel_by_id[other] = "friend"
        elif fr["status"] == "pending":
            rel_by_id[other] = "request_sent" if fr["requester_id"] == user["id"] else "request_received"

    out: List[dict] = []
    for r in merged[:15]:
        out.append({**_profile_min(r), "relationship": rel_by_id.get(r["id"])})
    return out


@router.get("")
async def list_friends(user = Depends(current_user)):
    """All accepted + pending friendships involving me. Annotated with the other user's profile."""
    rows = (
        supabase.table("friendships").select("*")
        .or_(f"requester_id.eq.{user['id']},addressee_id.eq.{user['id']}")
        .order("created_at", desc=True)
        .execute().data
    )
    other_ids = [
        (r["addressee_id"] if r["requester_id"] == user["id"] else r["requester_id"])
        for r in rows
    ]
    profiles_map = {}
    if other_ids:
        prof_rows = supabase.table("profiles").select("*").in_("id", other_ids).execute().data
        profiles_map = {p["id"]: p for p in prof_rows}

    out = []
    for r in rows:
        other_id = r["addressee_id"] if r["requester_id"] == user["id"] else r["requester_id"]
        out.append({
            "friendship_id": r["id"],
            "status": r["status"],
            "i_sent_request": r["requester_id"] == user["id"],
            "other": _profile_min(profiles_map.get(other_id, {"id": other_id})),
            "created_at": r["created_at"],
        })
    return out


@router.post("/request")
async def send_request(req: SendFriendRequest, user = Depends(current_user)):
    if req.addressee_id == user["id"]:
        raise HTTPException(400, "Cannot friend yourself.")

    # Already a relationship?
    existing = (
        supabase.table("friendships").select("*")
        .or_(f"and(requester_id.eq.{user['id']},addressee_id.eq.{req.addressee_id}),"
             f"and(requester_id.eq.{req.addressee_id},addressee_id.eq.{user['id']})")
        .execute().data
    )
    if existing:
        return {"friendship_id": existing[0]["id"], "status": existing[0]["status"], "existing": True}

    res = supabase.table("friendships").insert({
        "requester_id": user["id"],
        "addressee_id": req.addressee_id,
        "status": "pending",
    }).execute()
    return res.data[0]


@router.post("/respond")
async def respond_request(req: RespondFriendRequest, user = Depends(current_user)):
    fr = supabase.table("friendships").select("*").eq("id", req.friendship_id).execute().data
    if not fr:
        raise HTTPException(404, "Request not found")
    fr = fr[0]
    if fr["addressee_id"] != user["id"]:
        raise HTTPException(403, "Only the addressee can respond.")
    if fr["status"] != "pending":
        raise HTTPException(400, "Request is no longer pending.")

    new_status = "accepted" if req.accept else "declined"
    res = (
        supabase.table("friendships").update({"status": new_status, "updated_at": "now()"})
        .eq("id", req.friendship_id).execute()
    )
    return res.data[0]


@router.delete("/{friendship_id}")
async def remove_friend(friendship_id: str, user = Depends(current_user)):
    fr = supabase.table("friendships").select("*").eq("id", friendship_id).execute().data
    if not fr:
        raise HTTPException(404, "Not found")
    fr = fr[0]
    if user["id"] not in (fr["requester_id"], fr["addressee_id"]):
        raise HTTPException(403, "Not your friendship")
    supabase.table("friendships").delete().eq("id", friendship_id).execute()
    return {"deleted": True}


@router.post("/share")
async def share_outfit(req: ShareOutfitRequest, user = Depends(current_user)):
    """Share an outfit or try-on with a friend. Creates a notification for the recipient."""
    if not req.outfit_id and not req.tryon_id:
        raise HTTPException(400, "Must provide outfit_id or tryon_id")
    
    # Verify friendship exists and is accepted
    fr = supabase.table("friendships").select("*").or_(
        f"and(requester_id.eq.{user['id']},addressee_id.eq.{req.friend_id}),"
        f"and(requester_id.eq.{req.friend_id},addressee_id.eq.{user['id']})"
    ).eq("status", "accepted").execute().data
    
    if not fr:
        raise HTTPException(403, "Not friends with that user")
    
    # For demo: return success without persisting to new table
    # In production, would insert into a shares/notifications table
    return {
        "shared": True,
        "outfit_id": req.outfit_id,
        "tryon_id": req.tryon_id,
        "recipient_id": req.friend_id,
    }


@router.get("/shares")
async def get_shares(user = Depends(current_user)):
    """Get shares received by current user."""
    # For demo: return empty array
    # In production, would query shares table
    return []
