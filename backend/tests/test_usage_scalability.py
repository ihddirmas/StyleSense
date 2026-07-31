"""
Exercises the uncommitted scalability changes against the real Aurora DB before
they get committed:
  1. chat.py N+1 fix -> get_outfits_by_ids / get_tryons_by_ids batch fetch
  2. usage_limits.check_tryon_cap -> free-tier monthly try-on cap enforcement
  3. supabase_service.count_tryons_this_month -> the count the cap is based on
  4. usage_limits.check_event_scene_cap / check_animate_cap -> usage_events-backed caps
  5. supabase_service.record_usage_event / count_usage_events_this_month

Uses a disposable test user (not DEMO_USER_ID) so it doesn't skew any real
counts, and cleans up everything it inserts.
"""
import os
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from fastapi import HTTPException
from fastapi.testclient import TestClient

from main import app
from services import db, supabase_service, usage_limits
from services.auth_service import current_user

failures = []


def check(label, cond):
    status = "OK" if cond else "FAIL"
    print(f"[{status}] {label}")
    if not cond:
        failures.append(label)


def main():
    test_user_id = str(uuid.uuid4())
    supabase_service.upsert_user(test_user_id, email=f"{test_user_id}@test.local", full_name="Scalability Test")
    print(f"[INFO] test user {test_user_id}")

    tryon_ids = []
    outfit_ids = []

    try:
        # ── 1. batch fetch: get_tryons_by_ids / get_outfits_by_ids ──
        for i in range(3):
            row = supabase_service.save_tryon_result(
                user_id=test_user_id,
                item_id=None,
                result_url=f"https://example.com/tryon-{i}.jpg",
                model_used="gen4_image_turbo",
                prompt_used="test prompt",
                runway_task_id=f"task-{i}",
            )
            tryon_ids.append(row["id"])

        outfit_row = supabase_service.save_outfit(
            user_id=test_user_id,
            name="scalability-test-outfit",
            item_ids=[],
            occasion=None,
            preview_image_url=None,
            notes=None,
        )
        outfit_ids.append(outfit_row["id"])

        fetched_tryons = supabase_service.get_tryons_by_ids(tryon_ids)
        check("get_tryons_by_ids returns all 3 inserted rows", len(fetched_tryons) == 3)
        check(
            "get_tryons_by_ids ids match what was inserted",
            {t["id"] for t in fetched_tryons} == set(tryon_ids),
        )

        fetched_outfits = supabase_service.get_outfits_by_ids(outfit_ids)
        check("get_outfits_by_ids returns the inserted row", len(fetched_outfits) == 1)
        check("get_outfits_by_ids id matches", fetched_outfits[0]["id"] == outfit_ids[0])

        check("get_tryons_by_ids([]) short-circuits to []", supabase_service.get_tryons_by_ids([]) == [])
        check("get_outfits_by_ids([]) short-circuits to []", supabase_service.get_outfits_by_ids([]) == [])

        # ── 2. count_tryons_this_month ──
        count = supabase_service.count_tryons_this_month(test_user_id)
        check(f"count_tryons_this_month == 3 (got {count})", count == 3)

        # ── 3. check_tryon_cap: under the limit ──
        os.environ["FREE_TRYON_MONTHLY_LIMIT"] = "5"
        import importlib
        importlib.reload(usage_limits)
        try:
            usage_limits.check_tryon_cap(test_user_id)
            check("check_tryon_cap allows generation at 3/5 used", True)
        except HTTPException:
            check("check_tryon_cap allows generation at 3/5 used", False)

        # ── 4. check_tryon_cap: at/over the limit ──
        for i in range(3, 5):
            row = supabase_service.save_tryon_result(
                user_id=test_user_id,
                item_id=None,
                result_url=f"https://example.com/tryon-{i}.jpg",
                model_used="gen4_image_turbo",
                prompt_used="test prompt",
                runway_task_id=f"task-{i}",
            )
            tryon_ids.append(row["id"])

        count = supabase_service.count_tryons_this_month(test_user_id)
        check(f"count_tryons_this_month == 5 after topping up (got {count})", count == 5)

        try:
            usage_limits.check_tryon_cap(test_user_id)
            check("check_tryon_cap raises 402 at 5/5 used", False)
        except HTTPException as e:
            check("check_tryon_cap raises 402 at 5/5 used", e.status_code == 402)

        # ── 5. check_event_scene_cap / check_animate_cap: usage_events-backed ──
        os.environ["FREE_EVENT_SCENE_MONTHLY_LIMIT"] = "3"
        os.environ["FREE_ANIMATE_MONTHLY_LIMIT"] = "1"
        importlib.reload(usage_limits)

        check(
            "count_usage_events_this_month starts at 0 for a fresh user",
            supabase_service.count_usage_events_this_month(test_user_id, "event_scene") == 0,
        )

        try:
            usage_limits.check_event_scene_cap(test_user_id)
            check("check_event_scene_cap allows generation at 0/3 used", True)
        except HTTPException:
            check("check_event_scene_cap allows generation at 0/3 used", False)

        for _ in range(3):
            supabase_service.record_usage_event(test_user_id, "event_scene")

        count = supabase_service.count_usage_events_this_month(test_user_id, "event_scene")
        check(f"count_usage_events_this_month == 3 after 3 records (got {count})", count == 3)

        try:
            usage_limits.check_event_scene_cap(test_user_id)
            check("check_event_scene_cap raises 402 at 3/3 used", False)
        except HTTPException as e:
            check("check_event_scene_cap raises 402 at 3/3 used", e.status_code == 402)

        # animate: limit of 1, and confirm event_scene records don't bleed into it
        check(
            "animate count unaffected by event_scene records (got %d)" % (
                supabase_service.count_usage_events_this_month(test_user_id, "animate")
            ),
            supabase_service.count_usage_events_this_month(test_user_id, "animate") == 0,
        )

        try:
            usage_limits.check_animate_cap(test_user_id)
            check("check_animate_cap allows generation at 0/1 used", True)
        except HTTPException:
            check("check_animate_cap allows generation at 0/1 used", False)

        supabase_service.record_usage_event(test_user_id, "animate")

        try:
            usage_limits.check_animate_cap(test_user_id)
            check("check_animate_cap raises 402 at 1/1 used", False)
        except HTTPException as e:
            check("check_animate_cap raises 402 at 1/1 used", e.status_code == 402)

        # ── 6. GET /api/tryon/usage-status ──
        app.dependency_overrides[current_user] = lambda: {"id": test_user_id}
        client = TestClient(app)
        try:
            resp = client.get("/api/tryon/usage-status")
            check("usage-status returns 200", resp.status_code == 200)
            body = resp.json()
            tryon_status = body.get("tryon") or {}
            check(f"usage-status tryon.used == 5 (got {tryon_status.get('used')})", tryon_status.get("used") == 5)
            check(f"usage-status tryon.limit == 5 (got {tryon_status.get('limit')})", tryon_status.get("limit") == 5)
        finally:
            app.dependency_overrides.pop(current_user, None)

    finally:
        # ── cleanup ──
        if tryon_ids:
            db.query(
                "DELETE FROM try_on_results WHERE id = ANY((:ids)::uuid[])",
                {"ids": tryon_ids},
                fetch="none",
            )
        if outfit_ids:
            db.query(
                "DELETE FROM outfits WHERE id = ANY((:ids)::uuid[])",
                {"ids": outfit_ids},
                fetch="none",
            )
        db.query("DELETE FROM usage_events WHERE user_id = :id", {"id": test_user_id}, fetch="none")
        db.query("DELETE FROM users WHERE id = :id", {"id": test_user_id}, fetch="none")
        print("[INFO] cleaned up test rows")

    if failures:
        print(f"\n[FAIL] {len(failures)} check(s) failed: {failures}")
        sys.exit(1)
    print("\n[PASS] SCALABILITY CHANGES VERIFIED.")


if __name__ == "__main__":
    main()
