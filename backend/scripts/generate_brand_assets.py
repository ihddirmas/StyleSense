"""
ONE-OFF: generate StyleSenseAI logo/wordmark candidates via Runway's
gemini_2.5_flash text-to-image, for human review before anything gets wired
into the app. Does not touch the live site, favicon, or watermark code.

Usage:
  cd backend
  .\\venv\\Scripts\\python.exe -m scripts.generate_brand_assets
"""
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

import httpx
from runwayml import TaskFailedError, TaskTimeoutError
from services.runway_service import client as runway_client

OUT_DIR = Path(__file__).resolve().parent.parent / "_brand_candidates"

PROMPTS = {
    "wordmark-a": (
        "Minimalist wordmark logo design, the text 'StyleSenseAI' in a refined "
        "modern serif typeface, warm dark brown ink color on a transparent-feeling "
        "cream background. Subtle small geometric spark or circuit-node accent "
        "integrated into the dot of the 'i' to signal agentic AI intelligence, not "
        "a generic sparkle. Luxury fashion-tech brand identity, clean vector logo "
        "style, high contrast, professional brand design, no shadows, no 3D effects, "
        "flat design suitable for a favicon and app icon."
    ),
    "wordmark-b": (
        "Modern wordmark logo, 'StyleSenseAI', elegant condensed sans-serif "
        "typeface, deep espresso brown on warm parchment cream background. The "
        "'AI' letters rendered with a subtle interconnected node/network pattern "
        "woven into the letterforms to convey agentic, autonomous intelligence — "
        "sophisticated and understated, not sci-fi or robotic. Fashion editorial "
        "brand aesthetic, flat vector logo design, no gradients, no drop shadows."
    ),
    "icon-mark": (
        "Standalone abstract icon logo mark, no text, representing an AI fashion "
        "stylist agent — a single elegant geometric motif combining a stylized "
        "clothing hanger silhouette with a subtle neural-network node pattern, "
        "warm dark brown line art on transparent-feeling cream background. Minimal, "
        "luxury, flat vector icon design suitable for a small app favicon, high "
        "contrast, no gradients, no photorealism, no 3D rendering."
    ),
}

RATIO = "1024:1024"


async def generate_one(name: str, prompt: str) -> None:
    print(f"\n--- generating: {name} ---")
    try:
        task = runway_client.text_to_image.create(
            model="gemini_2.5_flash",
            prompt_text=prompt,
            ratio=RATIO,
        ).wait_for_task_output(timeout=180)
    except TaskFailedError as e:
        print(f"[FAIL] {name}: {e.task_details}")
        return
    except TaskTimeoutError:
        print(f"[FAIL] {name}: timed out")
        return
    except Exception as e:
        print(f"[FAIL] {name}: {type(e).__name__}: {e}")
        return

    url = task.output[0]
    print(f"[OK] {name}: {url[:90]}...")

    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as c:
        resp = await c.get(url)
        resp.raise_for_status()
    OUT_DIR.mkdir(exist_ok=True)
    out_path = OUT_DIR / f"{name}.png"
    out_path.write_bytes(resp.content)
    print(f"[OK] saved: {out_path}")


async def main():
    if not (os.getenv("RUNWAY_API_KEY") or os.getenv("RUNWAYML_API_SECRET")):
        print("[FAIL] RUNWAY_API_KEY not set in backend/.env")
        sys.exit(1)
    for name, prompt in PROMPTS.items():
        await generate_one(name, prompt)
    print(f"\nAll candidates saved to {OUT_DIR}")


if __name__ == "__main__":
    asyncio.run(main())
