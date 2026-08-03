"""Sync seed-account passwords from Cursor secrets (TEST_SEED_*_PASSWORD)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from supabase import create_client

from scripts.test_users import list_all_auth_users, seed_account_credentials


def main():
    import os

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("[FAIL] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")
        sys.exit(1)

    configured = seed_account_credentials()
    if not configured:
        print("[WARN] No TEST_SEED_*_PASSWORD secrets set")
        sys.exit(0)

    admin = create_client(url, key)
    by_email = {u.email: u.id for u in list_all_auth_users(admin)}

    for c in configured:
        uid = by_email.get(c["email"])
        if not uid:
            print(f"[FAIL] No auth user for {c['email']} ({c['key']})")
            continue
        admin.auth.admin.update_user_by_id(uid, {
            "password": c["password"],
            "email_confirm": True,
        })
        print(f"[OK] Synced {c['key']}: {c['email']}")

    anon = create_client(url, os.environ.get("SUPABASE_ANON_KEY", ""))
    for c in configured:
        try:
            anon.auth.sign_in_with_password({"email": c["email"], "password": c["password"]})
            print(f"[OK] Login verified: {c['key']}")
        except Exception as exc:
            print(f"[FAIL] Login {c['key']}: {exc}")
            sys.exit(1)


if __name__ == "__main__":
    main()
