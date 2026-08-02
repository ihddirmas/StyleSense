"""Smoke test Genblaze + B2 (requires B2_BUCKET, B2_KEY_ID, B2_APP_KEY, RUNWAYML_API_SECRET).

Skips gracefully when B2 is not configured. Does NOT run a paid Runway animate by default.
Set GENBLAZE_SMOKE_ANIMATE=1 to run a short veo3.1 clip (~60 credits).
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from services import genblaze_media_service


def main():
    if not genblaze_media_service.is_configured():
        print("[SKIP] B2 not configured (set B2_BUCKET, B2_KEY_ID, B2_APP_KEY)")
        return 0

    print("[OK] B2 + Genblaze configured")
    print(f"     bucket={os.getenv('B2_BUCKET') or os.getenv('B2_BUCKET_NAME')}")

    sample = os.getenv("GENBLAZE_SMOKE_IMAGE_URL", "").strip()
    if sample and os.getenv("GENBLAZE_SMOKE_ANIMATE") == "1":
        print("[RUN] Genblaze animate pipeline (Runway + B2)...")
        out = genblaze_media_service.run_image_to_video_pipeline(
            user_id="smoke-test",
            image_url=sample,
            motion_prompt="gentle runway walk toward camera",
            model="veo3.1",
            duration=4,
        )
        print(f"[OK] video={out.get('video_url')}")
        print(f"     manifest={out.get('manifest_hash')} verified={out.get('manifest_verified')}")
    else:
        print("[SKIP] animate (set GENBLAZE_SMOKE_IMAGE_URL + GENBLAZE_SMOKE_ANIMATE=1)")

    if sample:
        print("[RUN] Pipeline.ingest try-on archive...")
        prov = genblaze_media_service.ingest_tryon_image(
            "smoke-test", sample, tryon_id="smoke", model_used="smoke"
        )
        print(f"[OK] ingest manifest={prov.get('manifest_hash')} url={prov.get('b2_url')}")
    else:
        print("[SKIP] ingest (set GENBLAZE_SMOKE_IMAGE_URL to a public HTTPS image)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
