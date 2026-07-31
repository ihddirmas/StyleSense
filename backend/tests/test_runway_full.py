"""
Full Runway endpoint smoke test - run AFTER credits are confirmed working.

Tests every Runway endpoint we use:
  1. Garment cleaner (gen4_image_turbo with garment ref) - re-synthesizes a clean shot
  2. Single-item try-on (gen4_image_turbo with selfie + garment refs)
  3. Event scene (gen4_image with try-on as ref)
  4. Animate (gen4.5 image-to-video, 5s clip - ~60 credits)

Total credit cost: ~70-80 credits (heavy on the animate step).
Skip animate if you want to save credits: pass SKIP_ANIMATE=1 env var.

Usage:
  cd backend
  venv\\Scripts\\python.exe -m tests.test_runway_full
"""
import sys
import os
import io
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

import httpx
from PIL import Image

from services import supabase_service, runway_service
from services.garment_cleaner import clean_with_runway

DEMO_USER_ID = "00000000-0000-0000-0000-000000000001"
HEADERS = {"User-Agent": "Mozilla/5.0"}

# Test inputs - all must be public HTTPS
SELFIE_URL = "https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=800"
GARMENT_URL = "https://image.uniqlo.com/UQ/ST3/us/imagesgoods/465185/item/usgoods_00_465185_3x4.jpg"
MESSY_GARMENT_URL = "https://upload.wikimedia.org/wikipedia/commons/8/8d/Blazer.JPG"

results = {}


def step(label, fn):
    print(f"\n{'='*72}")
    print(f"  {label}")
    print('='*72)
    t0 = time.time()
    try:
        result = fn()
        elapsed = time.time() - t0
        print(f"  [OK] {elapsed:.1f}s")
        return result
    except Exception as e:
        elapsed = time.time() - t0
        print(f"  [FAIL] {elapsed:.1f}s: {type(e).__name__}: {e}")
        return None


# ============================================================
# 1. GARMENT CLEANER via Runway
# ============================================================
def test_cleaner():
    url = clean_with_runway(
        image_url=MESSY_GARMENT_URL,
        item_name="navy wool blazer",
        item_category="outerwear",
    )
    if not url:
        raise RuntimeError("clean_with_runway returned None")
    print(f"  Output URL: {url}")
    # Re-host to our bucket so it doesn't expire
    with httpx.Client(timeout=30.0, follow_redirects=True) as c:
        bytes_ = c.get(url).content
    permanent = supabase_service.upload_to_storage(
        bucket="wardrobe", user_id=DEMO_USER_ID,
        file_bytes=bytes_, filename="runway-cleaned-blazer.jpg",
        content_type="image/jpeg",
    )
    print(f"  Re-hosted: {permanent}")
    return permanent


# ============================================================
# 2. TRY-ON
# ============================================================
def test_tryon():
    out = runway_service.runway_generate_tryon(
        avatar_url=SELFIE_URL,
        item_url=GARMENT_URL,
        item_name="white cotton t-shirt",
        item_category="tops",
        model="gen4_image_turbo",
    )
    print(f"  Output URL: {out['image_url']}")
    print(f"  Model: {out['model_used']}, task: {out['task_id']}")
    # Re-host
    with httpx.Client(timeout=30.0, follow_redirects=True) as c:
        bytes_ = c.get(out['image_url']).content
    permanent = supabase_service.upload_to_storage(
        bucket="tryons", user_id=DEMO_USER_ID,
        file_bytes=bytes_, filename="tryon-test.jpg",
        content_type="image/jpeg",
    )
    print(f"  Re-hosted: {permanent}")
    return permanent


# ============================================================
# 3. EVENT SCENE
# ============================================================
def test_event_scene():
    tryon_url = results.get('tryon')
    if not tryon_url:
        print("  [SKIP] No try-on URL to use as reference")
        return None
    out = runway_service.runway_event_scene(
        tryon_url=tryon_url,
        event_context="rooftop cocktail party at golden hour, city skyline",
    )
    print(f"  Output URL: {out['image_url']}")
    with httpx.Client(timeout=30.0, follow_redirects=True) as c:
        bytes_ = c.get(out['image_url']).content
    permanent = supabase_service.upload_to_storage(
        bucket="tryons", user_id=DEMO_USER_ID,
        file_bytes=bytes_, filename="event-test.jpg",
        content_type="image/jpeg",
    )
    print(f"  Re-hosted: {permanent}")
    return permanent


# ============================================================
# 4. ANIMATE (expensive - ~60 credits)
# ============================================================
def test_animate():
    image_url = results.get('tryon')
    if not image_url:
        print("  [SKIP] No image URL to animate")
        return None
    if os.getenv("SKIP_ANIMATE") == "1":
        print("  [SKIP] SKIP_ANIMATE=1 set")
        return None
    out = runway_service.runway_animate(
        image_url=image_url,
        motion_prompt="Person turning slightly, confident fashion model pose, smooth movement",
    )
    print(f"  Output VIDEO: {out['video_url']}")
    return out['video_url']


# ============================================================
# RUN ALL
# ============================================================
def main():
    print("Runway full endpoint smoke test")
    print(f"Will use ~70 credits (or ~10 if SKIP_ANIMATE=1)")

    results['cleaner']   = step("[1/4] Cleaner via Runway re-synthesis (~3 credits)",  test_cleaner)
    results['tryon']     = step("[2/4] Try-on (gen4_image_turbo, ~3 credits)",         test_tryon)
    results['event']     = step("[3/4] Event scene (gen4_image, ~5 credits)",          test_event_scene)
    results['video']     = step("[4/4] Animate (gen4.5, ~60 credits)",                 test_animate)

    print("\n" + "="*72)
    print("RESULTS - open these URLs to verify quality:")
    print("="*72)
    print(f"\n  Original messy blazer (input):")
    print(f"    {MESSY_GARMENT_URL}")
    print(f"\n  Cleaner via Runway (should look like a clean studio shot):")
    print(f"    {results.get('cleaner') or '(failed)'}")
    print(f"\n  Try-on (selfie + garment -> person wearing it):")
    print(f"    {results.get('tryon') or '(failed)'}")
    print(f"\n  Event scene (try-on placed in rooftop party):")
    print(f"    {results.get('event') or '(failed)'}")
    print(f"\n  Animated try-on (5s video):")
    print(f"    {results.get('video') or '(failed/skipped)'}")

    failures = [k for k, v in results.items() if v is None and k != 'video']
    if failures:
        print(f"\n[PARTIAL] Failed steps: {failures}")
        sys.exit(1)
    print("\n[PASS] All non-video Runway endpoints working.")


if __name__ == "__main__":
    main()
