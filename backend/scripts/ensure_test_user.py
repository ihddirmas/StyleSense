"""Ensure the canonical QA test user exists (TEST_USER_EMAIL / TEST_USER_PASSWORD)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from supabase import create_client

from scripts.test_users import ensure_qa_user, qa_email


def main():
    url = __import__("os").environ.get("SUPABASE_URL")
    key = __import__("os").environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("[FAIL] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")
        sys.exit(1)

    admin = create_client(url, key)
    uid = ensure_qa_user(admin)
    print(f"[OK] QA user ready: {qa_email()} (id={uid})")
    print("     Use this account for browser/E2E tests — do not sign up new users.")


if __name__ == "__main__":
    main()
