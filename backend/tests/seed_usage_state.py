"""
Manual dev helper: seed or reset usage-cap state for a REAL account, so you can
hit the caps through the actual frontend UI without spending real Runway
credits on 5 try-ons / 3 event-scenes / 1 animate.

Usage (run from backend/, venv active):
  python -m tests.seed_usage_state <email> tryon 5        # set try-on count this month
  python -m tests.seed_usage_state <email> event_scene 3
  python -m tests.seed_usage_state <email> animate 1
  python -m tests.seed_usage_state <email> reset           # clear all seeded rows for this user

"tryon N" inserts N dummy try_on_results rows (fake result_url, no wardrobe item).
"event_scene N" / "animate N" insert N usage_events rows.
"reset" deletes rows this script created (tagged runway_task_id LIKE 'seed-%'
for try-ons, and ALL usage_events for the user - usage_events has no other
source yet besides this script and the real endpoints).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from services import db, supabase_service


def get_user_by_email(email: str) -> dict:
    user = db.query("SELECT * FROM users WHERE email = :email", {"email": email}, fetch="one")
    if not user:
        raise SystemExit(f"No user found with email {email!r}. Check you're using the account's login email.")
    return user


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    email = sys.argv[1]
    action = sys.argv[2]
    user = get_user_by_email(email)
    uid = user["id"]
    print(f"[INFO] user {email} -> {uid}")

    if action == "reset":
        deleted_tryons = db.query(
            "DELETE FROM try_on_results WHERE user_id = :uid AND runway_task_id LIKE 'seed-%' RETURNING id",
            {"uid": uid}, fetch="all",
        )
        deleted_events = db.query(
            "DELETE FROM usage_events WHERE user_id = :uid RETURNING id",
            {"uid": uid}, fetch="all",
        )
        print(f"[OK] removed {len(deleted_tryons)} seeded try-on rows, {len(deleted_events)} usage_events rows")
        return

    count = int(sys.argv[3])

    if action == "tryon":
        for i in range(count):
            supabase_service.save_tryon_result(
                user_id=uid, item_id=None,
                result_url=f"https://example.com/seed-{i}.jpg",
                model_used="seed", prompt_used="seed",
                runway_task_id=f"seed-{i}-{uid[:8]}",
            )
        print(f"[OK] inserted {count} try_on_results rows (free cap default is 5)")
    elif action in ("event_scene", "animate"):
        for _ in range(count):
            supabase_service.record_usage_event(uid, action)
        limit_note = "3" if action == "event_scene" else "1"
        print(f"[OK] inserted {count} usage_events rows for '{action}' (free cap default is {limit_note})")
    else:
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
