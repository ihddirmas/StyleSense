"""
Programmatic Custom Character (avatar) creation via Runway REST API.

Used only by scripts/setup_admin_stylist.py — the one-time provisioning script
for Aria's shared portrait/character, which backs the dashboard hero fallback
(GET /api/avatar/stylist) shown to users without a selfie yet. The interactive
per-session voice/character-sync routes that used to live in routers/avatar.py
were removed as unreachable (no frontend page mounted the voice avatar widget).

Discovered schema (verified by API probing 2026-05-10):
  POST https://api.dev.runwayml.com/v1/avatars
  body: {
    "name":          string,
    "referenceImage": string (public HTTPS URL of selfie),
    "personality":   string (system prompt for the stylist),
    "voice":         { "type": "custom", "id": <voice_id> }
  }
"""
import os
import httpx
import logging

logger = logging.getLogger(__name__)

API_BASE = "https://api.dev.runwayml.com/v1"
API_VERSION = "2024-11-06"
_API_KEY = os.getenv("RUNWAY_API_KEY") or os.getenv("RUNWAYML_API_SECRET")
_DEFAULT_VOICE_ID = os.getenv("RUNWAY_DEFAULT_VOICE_ID")


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {_API_KEY}",
        "Content-Type": "application/json",
        "X-Runway-Version": API_VERSION,
    }


async def create_character(
    selfie_url: str,
    name: str,
    instructions: str,
    starting_script: str = "Hi! I'm your personal stylist. What would you like to put together today?",
    voice_id: str | None = None,
) -> dict:
    """
    Create a Custom Character (avatar) programmatically.

    Args:
        selfie_url: public HTTPS URL of the user's selfie (Supabase Storage works)
        name: display name for the character
        instructions: system prompt that defines the stylist persona
        starting_script: not used by current API but kept for future
        voice_id: Runway voice ID. If None, uses RUNWAY_DEFAULT_VOICE_ID env var.

    Returns dict with 'id' (the avatar UUID to store) plus full Runway response.
    Raises RuntimeError on API rejection with details for fallback.
    """
    voice = voice_id or _DEFAULT_VOICE_ID
    if not voice:
        raise RuntimeError(
            "No voice configured. Run `python -m tests.setup_default_voice` once "
            "to create a shared voice, then add RUNWAY_DEFAULT_VOICE_ID to backend/.env."
        )

    payload = {
        "name": name,
        "referenceImage": selfie_url,
        "personality": instructions,
        "voice": {"type": "custom", "id": voice},
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(f"{API_BASE}/avatars", headers=_headers(), json=payload)

    if resp.status_code >= 400:
        logger.error(f"Runway create_character failed {resp.status_code}: {resp.text}")
        raise RuntimeError(
            f"Could not create character ({resp.status_code}): {resp.text[:500]}"
        )

    return resp.json()


def build_stylist_instructions(user_name: str = "the user") -> str:
    """The system prompt that defines the avatar's stylist persona."""
    return (
        f"You are a friendly, expert personal stylist for {user_name}. You can see "
        f"{user_name}'s entire wardrobe in your knowledge base. "
        f"Suggest specific outfits using items from {user_name}'s actual wardrobe (reference items by name). "
        f"Give honest opinions on color, fit, and occasion. Keep replies short and conversational "
        f"(2-3 sentences for the spoken portion). If the user wants to try something on, "
        f"encourage them to use the Studio tab. Never invent items that aren't in the wardrobe."
    )
