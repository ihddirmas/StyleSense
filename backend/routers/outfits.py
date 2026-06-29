"""Saved outfits CRUD."""
import uuid
from fastapi import APIRouter, Depends, HTTPException
from models.schemas import SaveOutfit
from services import supabase_service
from services.auth_service import current_user

router = APIRouter()


@router.get("")
async def list_outfits(user = Depends(current_user)):
    return supabase_service.get_outfits(user["id"])


@router.post("/save")
async def save_outfit(req: SaveOutfit, user = Depends(current_user)):
    for iid in req.item_ids:
        try:
            uuid.UUID(iid)
        except ValueError:
            raise HTTPException(422, f"Invalid item_id (not a UUID): {iid!r}")
    outfit = supabase_service.save_outfit(
        user_id=user["id"],
        name=req.name,
        item_ids=req.item_ids,
        occasion=req.occasion,
        preview_image_url=req.preview_image_url,
        notes=req.notes,
    )
    # Persist the underlying try-on too, so it stops being a hidden draft.
    if req.tryon_result_id:
        try:
            supabase_service.mark_tryon_saved(req.tryon_result_id)
        except Exception:
            pass
    return outfit


@router.delete("/{outfit_id}")
async def delete_outfit(outfit_id: str, user = Depends(current_user)):
    o = supabase_service.get_outfit(outfit_id)
    if not o:
        raise HTTPException(404, "Outfit not found")
    if o["user_id"] != user["id"]:
        raise HTTPException(403, "Not your outfit")
    supabase_service.delete_outfit(outfit_id)
    return {"deleted": True}
