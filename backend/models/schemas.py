"""Pydantic request/response models for StyleAI backend.

Note: most endpoints derive user_id from the auth token (Depends(current_user))
rather than the request body. The user_id field on these models is kept for
back-compat but is ignored / overridden server-side.
"""
from pydantic import BaseModel, Field
from typing import Literal, Optional, List

# Must match the DB CHECK constraints on wardrobe_items (category, occasion) --
# an unlisted value previously reached the INSERT and crashed as an unhandled
# 500 instead of a clean 422. Keep in sync with supabase_schema*.sql.
WardrobeCategory = Literal["tops", "bottoms", "dresses", "outerwear", "shoes", "accessories"]
WardrobeOccasion = Literal["casual", "formal", "evening", "sport", "beach", "any"]


# ─────────────────────────── TRY-ON ─────────────────────────── #

class TryOnRequest(BaseModel):
    wardrobe_item_id: Optional[str] = None
    item_image_url: str
    avatar_selfie_url: str
    item_name: str
    item_category: str = "tops"
    model: str = "gen4_image"  # Default to full quality for best results
    setting: Optional[str] = None  # Optional cinematic setting override
    enhance_prompt: bool = True  # Run the prompt-builder graph on `setting`
    reference_selfie_urls: Optional[List[str]] = None  # extra selfie refs (Gemini identity)


class MultiItemTryOnRequest(BaseModel):
    avatar_selfie_url: str
    items: List[dict] = Field(
        ...,
        description="List of {image_url, name, category} dicts. No hard limit (uses composite collage)."
    )
    model: str = "gen4_image"
    setting: Optional[str] = None
    enhance_prompt: bool = True  # Run the prompt-builder graph on `setting`
    reference_selfie_urls: Optional[List[str]] = None  # extra selfie refs (Gemini identity)


class EventSceneRequest(BaseModel):
    tryon_result_url: str
    event_context: str
    tryon_result_id: Optional[str] = None


class AnimateRequest(BaseModel):
    image_url: str
    motion_prompt: str = "Person slowly turning, confident fashion model pose, smooth movement"
    scene: Optional[str] = None  # Optional scene/background folded into the motion prompt
    model: Optional[str] = None  # Video model id; validated + defaulted server-side
    enhance_prompt: bool = True  # Run the prompt-builder graph on motion/scene
    tryon_result_id: Optional[str] = None


# ─────────────────────────── WARDROBE ─────────────────────────── #

class AddWardrobeFromUrl(BaseModel):
    name: str
    category: WardrobeCategory
    image_url: str
    occasion: Optional[WardrobeOccasion] = "casual"
    color: Optional[str] = None
    brand: Optional[str] = None
    source_url: Optional[str] = None
    tags: List[str] = []
    clean: Optional[str] = "none"  # "auto" | "runway" | "rembg" | "none"


class ExtractFromImage(BaseModel):
    """Save a garment from any image (e.g. a friend-shared try-on or outfit
    preview) into the user's wardrobe. Always runs the cleaner."""
    image_url: str
    name: str = "Inspired item"
    category: WardrobeCategory = "tops"
    occasion: Optional[WardrobeOccasion] = "casual"
    notes: Optional[str] = None


class DetectedItem(BaseModel):
    """One garment detected by Claude vision in a multi-item photo."""
    name: str
    category: str  # tops | bottoms | dresses | outerwear | shoes | accessories
    color: Optional[str] = None
    brand: Optional[str] = None
    occasion: Optional[str] = "casual"
    position: Optional[str] = None  # vision-supplied locator hint, fed to Runway isolation


class DetectItemsResponse(BaseModel):
    image_url: str
    detected: List[DetectedItem]


class DetectFromUrlRequest(BaseModel):
    image_url: str


class AddMultiRequest(BaseModel):
    source_image_url: str
    items: List[DetectedItem]


class AddMultiFailure(BaseModel):
    name: str
    reason: str


class AddMultiResponse(BaseModel):
    created: List[dict]  # WardrobeItem-shaped rows
    failed: List[AddMultiFailure]


class StylistWardrobeDetectRequest(BaseModel):
    image_data: str  # base64 data URI


class StylistWardrobeDetectResponse(BaseModel):
    detected: List[DetectedItem]
    image_url: str


class StylistWardrobeConfirmRequest(BaseModel):
    source_image_url: str
    items: List[DetectedItem]


class StylistWardrobeConfirmResponse(BaseModel):
    created: List[dict]
    failed: List[AddMultiFailure]
    summary: str


class ScrapeRequest(BaseModel):
    url: str


class ScrapeResponse(BaseModel):
    image_url: str
    name: str
    source_url: str
    suggested_category: Optional[str] = None


# ─────────────────────────── OUTFITS ─────────────────────────── #

class SaveOutfit(BaseModel):
    name: str
    item_ids: List[str]
    occasion: Optional[str] = None
    preview_image_url: Optional[str] = None
    notes: Optional[str] = None
    tryon_result_id: Optional[str] = None  # if set, marks that try-on as saved


# ─────────────────────────── AVATAR ─────────────────────────── #

# ─────────────────────────── STYLIST CHAT ─────────────────────────── #

class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class StylistChatRequest(BaseModel):
    messages: List[ChatMessage]
    image_url: Optional[str] = None


class PendingAction(BaseModel):
    """A tool call Aria proposed but hasn't executed -- shown to the user as a
    confirm/cancel card before it spends credits or writes data."""
    tool_name: str
    tool_use_id: str
    tool_input: dict
    summary: str
    cost_credits: Optional[int] = None


class ProductPreview(BaseModel):
    """Result of Aria auto-executing lookup_product_from_url -- read-only, no
    confirmation needed, so unlike PendingAction it's already resolved by the time
    the chat response is sent."""
    image_url: str
    name: str
    source_url: str
    suggested_category: Optional[str] = None


class StylistChatResponse(BaseModel):
    reply: str
    suggested_item_ids: List[str] = []
    occasion: Optional[str] = None
    scene: Optional[str] = None  # try-on background for "Manifest this look"
    pending_action: Optional[PendingAction] = None
    product_preview: Optional[ProductPreview] = None
    capsule_plan: Optional[dict] = None


class StylistFeedbackRequest(BaseModel):
    rating: str  # "up" | "down"
    verdict: Optional[str] = None
    item_ids: List[str] = []
    url: Optional[str] = None
    note: Optional[str] = None


class ToolConfirmRequest(BaseModel):
    tool_name: str
    tool_use_id: str
    decision: str  # "confirm" | "cancel"


class ToolConfirmResponse(BaseModel):
    executed: bool
    summary: str
    created: List[dict] = []
    failed: List[AddMultiFailure] = []
    result_image_url: Optional[str] = None
    result_id: Optional[str] = None


# ─────────────────────────── FRIENDS / CHAT ─────────────────────────── #

class FriendSearchResult(BaseModel):
    id: str
    full_name: Optional[str]
    email: Optional[str]
    username: Optional[str]
    share_code: str
    relationship: Optional[str] = None  # "friend" | "request_sent" | "request_received" | None


class SendFriendRequest(BaseModel):
    addressee_id: str


class RespondFriendRequest(BaseModel):
    friendship_id: str
    accept: bool


class SendMessageRequest(BaseModel):
    recipient_id: str
    content: Optional[str] = None
    shared_outfit_id: Optional[str] = None
    shared_tryon_id: Optional[str] = None
    shared_image_url: Optional[str] = None
    shared_caption: Optional[str] = None
