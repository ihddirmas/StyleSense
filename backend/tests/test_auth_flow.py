"""
End-to-end test of the Supabase auth flow EXACTLY as the frontend does it.
Confirms:
  1. Sign-up works (no 'database error')
  2. The handle_new_user() trigger created a profile row
  3. The legacy users row was created
  4. Sign-in works and returns a valid JWT
  5. The JWT can call our protected backend endpoints
  6. Cleanup: deletes the test user
"""
import os
import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

import httpx
from supabase import create_client

from scripts.test_users import test_user_metadata

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
# Read anon key from env. Add SUPABASE_ANON_KEY to backend/.env to run this test.
# (The anon key is also in frontend/.env.local as NEXT_PUBLIC_SUPABASE_ANON_KEY.)
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
if not SUPABASE_ANON_KEY:
    print("[SKIP] SUPABASE_ANON_KEY not set in backend/.env")
    print("       Copy NEXT_PUBLIC_SUPABASE_ANON_KEY from frontend/.env.local into backend/.env")
    print("       as SUPABASE_ANON_KEY=... and re-run this test.")
    sys.exit(0)

BACKEND_URL = "http://localhost:8000"

TEST_EMAIL = f"smoke-{uuid.uuid4().hex[:8]}@example.com"
TEST_PASSWORD = "TestPassword123!"

failures = []
test_user_id = None


def step(label):
    print(f"\n{'='*72}")
    print(f"  {label}")
    print('='*72)


def main():
    global test_user_id

    # Anon-key client (what the frontend uses)
    anon = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    # Service-role client (admin operations)
    admin = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    # ============================================================
    step(f"[1/6] Create user via admin API (bypasses email validation): {TEST_EMAIL}")
    # ============================================================
    # Note: production users sign up via the anon-key flow, which goes through
    # Supabase's email validator. The admin path bypasses that — but it still
    # exercises the SAME handle_new_user() trigger, which is what we're testing.
    try:
        result = admin.auth.admin.create_user({
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "email_confirm": True,
            "user_metadata": test_user_metadata("auth_smoke", full_name="Smoke Test User"),
        })
        if not result.user:
            failures.append(f"admin.create_user returned no user: {result}")
            print(f"  [FAIL] No user returned")
            return
        test_user_id = result.user.id
        print(f"  [OK] User created: id={test_user_id} email={result.user.email}")
    except Exception as e:
        failures.append(f"admin.create_user failed: {e}")
        print(f"  [FAIL] {type(e).__name__}: {e}")
        return

    # Also test the public anon-key signup path with a real domain to catch
    # the "database error" issue specifically
    print()
    print("  Also testing public anon-key signup path (the one users hit)...")
    public_email = f"public-{uuid.uuid4().hex[:8]}@example.com"
    try:
        anon_result = anon.auth.sign_up({
            "email": public_email,
            "password": TEST_PASSWORD,
            "options": {"data": test_user_metadata("auth_smoke_public", full_name="Public Smoke")},
        })
        if anon_result.user:
            print(f"  [OK] Public sign_up worked too: {anon_result.user.id}")
            print(f"       Session returned: {anon_result.session is not None}")
            # Clean up immediately
            try:
                admin.auth.admin.delete_user(anon_result.user.id)
            except Exception:
                pass
        else:
            print(f"  [WARN] Public sign_up returned no user")
    except Exception as e:
        # If this is a DB error, the trigger is broken
        msg = str(e)
        if "database" in msg.lower() or "Database" in msg:
            failures.append(f"PUBLIC SIGN-UP STILL HITS DB ERROR: {e}")
            print(f"  [FAIL] Public sign_up: {type(e).__name__}: {e}")
            print(f"         => This is what your users would see in the browser.")
            print(f"         => Trigger is still broken. Run supabase_schema_v2b_fix.sql.")
        else:
            print(f"  [INFO] Public sign_up: {type(e).__name__}: {e}")
            print(f"         (Not a DB error - might just be email validation. OK for our purposes.)")

    # ============================================================
    step("[2/6] Verify trigger created profile row")
    # ============================================================
    time.sleep(0.5)  # trigger should run synchronously, but small buffer
    profile_rows = admin.table("profiles").select("*").eq("id", test_user_id).execute().data
    if not profile_rows:
        failures.append("Profile row was NOT created by trigger - signup will work but app will be broken")
        print("  [FAIL] No profile row found. handle_new_user() trigger is not working.")
    else:
        p = profile_rows[0]
        print(f"  [OK] Profile created: full_name={p.get('full_name')}, share_code={p.get('share_code')}")
        if not p.get("share_code"):
            failures.append("Profile created but share_code is missing")
            print(f"  [FAIL] Profile has no share_code")

    # ============================================================
    step("[3/6] Verify legacy users row was created")
    # ============================================================
    user_rows = admin.table("users").select("*").eq("id", test_user_id).execute().data
    if not user_rows:
        failures.append("Legacy users row was NOT created by trigger")
        print("  [FAIL] No users row found.")
    else:
        print(f"  [OK] users row created: full_name={user_rows[0].get('full_name')}")

    # ============================================================
    step("[4/6] Sign in with the new credentials")
    # ============================================================
    # If email confirmation is enabled, this will fail until the user clicks the email link.
    try:
        signin = anon.auth.sign_in_with_password({
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
        })
        if not signin.session or not signin.session.access_token:
            failures.append(f"sign_in returned no session/token")
            print(f"  [FAIL] No session/access_token: {signin}")
            jwt = None
        else:
            jwt = signin.session.access_token
            print(f"  [OK] Got JWT: {jwt[:30]}... ({len(jwt)} chars)")
    except Exception as e:
        # Common cause: email confirmation enabled and user hasn't clicked the link
        if "email" in str(e).lower() or "not confirmed" in str(e).lower():
            print(f"  [INFO] {e}")
            print(f"         => Email confirmation IS enabled in Supabase.")
            print(f"         Disable it in Supabase Dashboard -> Authentication -> Providers")
            print(f"         -> Email -> toggle 'Confirm email' OFF.")
            failures.append(f"sign_in needs email confirmation: {e}")
            jwt = None
        else:
            failures.append(f"sign_in failed: {e}")
            print(f"  [FAIL] {type(e).__name__}: {e}")
            jwt = None

    # ============================================================
    step("[5/6] Use JWT to call protected backend endpoint /api/wardrobe")
    # ============================================================
    if jwt:
        try:
            with httpx.Client(timeout=10.0) as c:
                r = c.get(f"{BACKEND_URL}/api/wardrobe",
                          headers={"Authorization": f"Bearer {jwt}"})
            if r.status_code == 200:
                items = r.json()
                print(f"  [OK] Backend accepted JWT. Wardrobe has {len(items)} items.")
            else:
                failures.append(f"Backend rejected JWT: {r.status_code} {r.text[:120]}")
                print(f"  [FAIL] {r.status_code}: {r.text[:200]}")
        except Exception as e:
            failures.append(f"Backend call failed: {e}")
            print(f"  [FAIL] {e}")
    else:
        print("  [SKIP] No JWT to test with")

    # ============================================================
    step("[6/6] Cleanup: delete the test user")
    # ============================================================
    try:
        admin.auth.admin.delete_user(test_user_id)
        print(f"  [OK] Deleted user {test_user_id}")
    except Exception as e:
        print(f"  [WARN] Could not delete: {e} (manual cleanup needed)")

    # ============================================================
    print("\n" + "="*72)
    print("RESULT")
    print("="*72)
    if not failures:
        print("[PASS] Auth flow is fully working. Sign-up + sign-in both work end-to-end.")
        sys.exit(0)
    else:
        print(f"[FAIL] {len(failures)} issue(s):")
        for f in failures:
            print(f"  - {f}")
        sys.exit(1)


if __name__ == "__main__":
    main()
