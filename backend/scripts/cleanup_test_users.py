"""List or delete ephemeral Supabase auth users created by agents/smoke tests."""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from supabase import create_client

from scripts.test_users import cleanup_ephemeral_users, protected_emails, qa_email


def main():
    parser = argparse.ArgumentParser(description="Clean up disposable Supabase auth users")
    parser.add_argument("--apply", action="store_true", help="Actually delete (default is dry-run)")
    args = parser.parse_args()

    import os
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("[FAIL] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")
        sys.exit(1)

    admin = create_client(url, key)
    dry_run = not args.apply
    targets = cleanup_ephemeral_users(admin, dry_run=dry_run)

    mode = "DRY RUN" if dry_run else "DELETED"
    print(f"[{mode}] {len(targets)} ephemeral user(s)")
    print(f"Protected (never deleted): {', '.join(sorted(protected_emails()))}")
    print(f"Canonical QA: {qa_email()}")
    for u in targets:
        print(f"  - {u.email} ({u.id})")

    if dry_run and targets:
        print("\nRe-run with --apply to delete these accounts.")


if __name__ == "__main__":
    main()
