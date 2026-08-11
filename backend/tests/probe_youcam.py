"""
Live smoke test for the YouCam integration (services/youcam_service.py) --
the real confirmation that the reverse-engineered API contract is correct,
now that a real YOUCAM_API_KEY exists. Costs a small number of YouCam API
units (well within the 1,000 free hackathon units).

Usage:
  cd backend
  .\\venv\\Scripts\\python.exe -m tests.probe_youcam            # both calls
  .\\venv\\Scripts\\python.exe -m tests.probe_youcam tone        # skin-tone only
  .\\venv\\Scripts\\python.exe -m tests.probe_youcam vto         # apparel VTO only
"""
import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from services import youcam_service

# Public, stable, forward-facing portrait (Unsplash, free use) -- same
# hotlinking convention as tests.probe_detect_items.
FACE_URL = "https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=800"
# Public flat-lay garment photo for the VTO reference.
GARMENT_URL = "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800"


def run_tone():
    print("=== skin-tone-analysis ===")
    try:
        result = youcam_service.youcam_skin_tone_analysis(FACE_URL)
        print(json.dumps(result, indent=2))
        print("PASS")
    except Exception as e:
        print(f"FAIL: {type(e).__name__}: {e}")


def run_vto():
    print("=== apparel VTO (cloth-v3) ===")
    try:
        result = youcam_service.youcam_apparel_tryon(FACE_URL, GARMENT_URL, "upper_body")
        print(json.dumps(result, indent=2))
        print("PASS")
    except Exception as e:
        print(f"FAIL: {type(e).__name__}: {e}")


if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "both"
    if which in ("tone", "both"):
        run_tone()
    if which in ("vto", "both"):
        run_vto()
