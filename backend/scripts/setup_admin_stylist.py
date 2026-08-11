"""
ONE-TIME SETUP: create the shared admin stylist character ("Aria") that all
StyleSenseAI users see when they open the AI Stylist voice tab.

Pipeline:
  1. Generate a stylized 3D female stylist portrait via Runway gen4_image
  2. Upload to Supabase Storage (public)
  3. Create a Runway Custom Avatar from it (uses RUNWAY_DEFAULT_VOICE_ID)
  4. Poll until status == READY
  5. Print STYLIST_CHARACTER_ID to add to backend/.env + frontend/.env.local

Cost: ~5 credits (gen4_image) + character creation overhead. One-time.

Usage (PowerShell):
  cd backend
  .\\venv\\Scripts\\python.exe -m scripts.setup_admin_stylist

  # Re-run with FORCE=1 to replace an existing admin character:
  $env:FORCE="1"; .\\venv\\Scripts\\python.exe -m scripts.setup_admin_stylist
"""
import asyncio
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

import httpx
from runwayml import TaskFailedError, TaskTimeoutError

from services import supabase_service, character_service
from services.runway_service import client as runway_client

DEMO_USER_ID = "00000000-0000-0000-0000-000000000001"
RUNWAY_KEY = os.getenv("RUNWAY_API_KEY") or os.getenv("RUNWAYML_API_SECRET")
DEFAULT_VOICE = os.getenv("RUNWAY_DEFAULT_VOICE_ID")
API_BASE = "https://api.dev.runwayml.com/v1"

PROMPT = (
    "Editorial 3D character render of an elegant female fashion stylist mascot. "
    "Stylized fashion illustration aesthetic in the style of high end fashion brand CGI "
    "and luxury runway visuals. Confident warm welcoming expression. Sleek refined "
    "character design with contemporary fashion forward styling. Centered head and "
    "shoulders portrait, clean neutral warm grey studio background, soft cinematic studio "
    "lighting with subtle gold rim light. Fashion brand mascot character design, "
    "polished 3D rendering, matte skin texture, sleek modern hair styling, designer "
    "minimalist top in muted tones. High quality character design, elegant approachable "
    "confident, suitable for a luxury fashion technology product."
)


def step(label):
    print(f"\n{'='*72}\n  {label}\n{'='*72}")


async def poll_until_ready(character_id: str, max_wait_s: int = 180) -> str:
    """Poll Runway avatar status. Returns final status."""
    headers = {
        "Authorization": f"Bearer {RUNWAY_KEY}",
        "X-Runway-Version": "2024-11-06",
    }
    start = time.time()
    last = None
    async with httpx.AsyncClient(timeout=15.0) as c:
        while time.time() - start < max_wait_s:
            r = await c.get(f"{API_BASE}/avatars/{character_id}", headers=headers)
            if r.status_code >= 400:
                print(f"  [WARN] status fetch {r.status_code}: {r.text[:120]}")
                await asyncio.sleep(5)
                continue
            data = r.json()
            status = data.get("status", "UNKNOWN")
            if status != last:
                print(f"  [{int(time.time() - start)}s] status: {status}")
                last = status
            if status == "READY":
                return status
            if status == "FAILED":
                return status
            await asyncio.sleep(5)
    return last or "TIMEOUT"


async def main():
    if not RUNWAY_KEY:
        print("[FAIL] RUNWAY_API_KEY not set in backend/.env"); sys.exit(1)
    if not DEFAULT_VOICE:
        print("[FAIL] RUNWAY_DEFAULT_VOICE_ID not set. Run setup_default_voice.py first.")
        sys.exit(1)

    existing = os.getenv("STYLIST_CHARACTER_ID")
    if existing and existing != "PASTE_HERE" and not os.getenv("FORCE"):
        print(f"[INFO] STYLIST_CHARACTER_ID already set: {existing}")
        print("       Set $env:FORCE=\"1\" to replace.")
        sys.exit(0)

    # ─── Step 1: generate the 3D stylist image ──────────────────────────── #
    step("[1/4] Generate 3D stylist portrait via Runway gen4_image (~5 credits, ~30s)")
    try:
        task = runway_client.text_to_image.create(
            model="gen4_image",
            prompt_text=PROMPT,
            ratio="720:960",  # 3:4 portrait
        ).wait_for_task_output(timeout=180)
    except TaskFailedError as e:
        print(f"[FAIL] Runway image gen failed: {e.task_details}"); sys.exit(2)
    except TaskTimeoutError:
        print("[FAIL] Runway image gen timed out"); sys.exit(3)
    except Exception as e:
        print(f"[FAIL] {type(e).__name__}: {e}"); sys.exit(4)

    runway_url = task.output[0]
    print(f"  [OK] Runway-hosted image: {runway_url[:80]}...")

    # ─── Step 2: rehost to Supabase (Runway URLs are short-lived JWTs) ──── #
    step("[2/4] Rehost to Supabase Storage")
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as c:
        img_resp = await c.get(runway_url)
        img_resp.raise_for_status()
    permanent_url = supabase_service.upload_to_storage(
        bucket="selfies",
        user_id=DEMO_USER_ID,
        file_bytes=img_resp.content,
        filename="admin-stylist-aria.jpg",
        content_type="image/jpeg",
    )
    print(f"  [OK] Permanent URL: {permanent_url}")

    # ─── Step 3: create the Runway Custom Avatar ────────────────────────── #
    step("[3/4] Create Runway Custom Avatar (uses RUNWAY_DEFAULT_VOICE_ID)")
    instructions = character_service.build_stylist_instructions("StyleSenseAI users")
    try:
        result = await character_service.create_character(
            selfie_url=permanent_url,
            name="Aria - StyleSenseAI Stylist",
            instructions=instructions,
            voice_id=None,  # falls back to RUNWAY_DEFAULT_VOICE_ID
        )
    except RuntimeError as e:
        print(f"[FAIL] Avatar creation failed: {e}")
        sys.exit(5)

    char_id = result.get("id")
    if not char_id:
        print(f"[FAIL] No id in response: {result}")
        sys.exit(6)
    initial_status = result.get("status", "UNKNOWN")
    print(f"  [OK] Avatar created: id={char_id} (initial status: {initial_status})")

    # ─── Step 4: poll until READY ───────────────────────────────────────── #
    step("[4/4] Wait for avatar to become READY")
    final = await poll_until_ready(char_id)
    if final == "READY":
        print(f"  [OK] Avatar is READY")
    else:
        print(f"  [WARN] Final status: {final}. The avatar may still finish processing.")
        print("         Try `curl -H 'Authorization: Bearer $RUNWAY_API_KEY' ...` to check.")

    # ─── Output ────────────────────────────────────────────────────────── #
    step("DONE - paste this into backend/.env AND frontend/.env.local")
    print(f"\n  STYLIST_CHARACTER_ID={char_id}\n")
    print(f"  Reference image: {permanent_url}")
    print("\n  Then restart both servers and refresh the browser.")


if __name__ == "__main__":
    asyncio.run(main())
