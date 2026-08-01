#!/usr/bin/env python3
"""Live test: is Aria stylist agentic (LangGraph + tools) vs basic suggestions?"""
import json
import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

API = os.getenv("STYLIST_TEST_API", "https://styleai-backend-5vk9.onrender.com")
def _test_email() -> str:
    key = "TEST_USER_" + "EMAIL"
    return os.environ[key]
PASSWORD = os.getenv("TEST_SEED_ELLBIT_PASSWORD") or os.getenv("TEST_USER_PASSWORD")
SUPABASE_URL = os.getenv("SUPABASE_URL")
ANON = os.getenv("SUPABASE_ANON_KEY")

if not all([PASSWORD, SUPABASE_URL, ANON]):
    print("[FAIL] Need TEST_SEED_ELLBIT_PASSWORD, SUPABASE_URL, SUPABASE_ANON_KEY")
    sys.exit(1)


def sign_in() -> str:
    client = create_client(SUPABASE_URL, ANON)
    res = client.auth.sign_in_with_password({"email": EMAIL, "password": PASSWORD})
    token = res.session.access_token
    print(f"[OK] signed in as {EMAIL}")
    return token


def chat(token: str, content: str) -> dict:
    r = httpx.post(
        f"{API}/api/stylist/chat",
        headers={"Authorization": f"Bearer {token}"},
        json={"messages": [{"role": "user", "content": content}]},
        timeout=120.0,
    )
    r.raise_for_status()
    return r.json()


def suggestions(token: str) -> dict:
    r = httpx.get(
        f"{API}/api/stylist/suggestions",
        headers={"Authorization": f"Bearer {token}"},
        timeout=60.0,
    )
    r.raise_for_status()
    return r.json()


def main() -> None:
    token = sign_in()
    wardrobe = httpx.get(
        f"{API}/api/wardrobe",
        headers={"Authorization": f"Bearer {token}"},
        timeout=60.0,
    )
    wardrobe.raise_for_status()
    items = wardrobe.json()
    print(f"[OK] wardrobe items: {len(items)}")

    # Agentic path: occasion + wardrobe-specific picks
    agentic = chat(
        token,
        "I'm going to a rooftop cocktail party tonight. Pick exactly 2 items from MY wardrobe and explain why. Use [ITEM:id] format.",
    )
    reply = agentic.get("reply", "")
    item_ids = agentic.get("suggested_item_ids") or []
    pending = agentic.get("pending_action")
    preview = agentic.get("product_preview")
    occasion = agentic.get("occasion")

    print("\n--- /api/stylist/chat (LangGraph Aria) ---")
    print(f"occasion: {occasion}")
    print(f"suggested_item_ids ({len(item_ids)}): {item_ids[:4]}")
    print(f"pending_action: {json.dumps(pending, indent=2) if pending else None}")
    print(f"product_preview: {'yes' if preview else 'no'}")
    print(f"reply excerpt: {reply[:400]}...")

    wardrobe_ids = {i["id"] for i in items}
    picks_from_wardrobe = all(i in wardrobe_ids for i in item_ids) if item_ids else False
    has_item_tags = "[ITEM:" in reply

    checks = {
        "returns_suggested_item_ids": len(item_ids) >= 1,
        "picks_are_real_wardrobe_ids": picks_from_wardrobe,
        "reply_uses_ITEM_format": has_item_tags,
        "detects_occasion": bool(occasion),
    }

    # Try to trigger generate_tryon pending card
    tryon = chat(
        token,
        "Manifest a try-on with those two items on me right now. Use generate_tryon.",
    )
    tryon_pending = tryon.get("pending_action")
    print("\n--- try-on tool probe ---")
    print(f"pending_action: {json.dumps(tryon_pending, indent=2) if tryon_pending else None}")
    if tryon_pending:
        checks["generate_tryon_pending_action"] = tryon_pending.get("tool_name") == "generate_tryon"
        checks["pending_has_tool_use_id"] = bool(tryon_pending.get("tool_use_id"))

    # Basic non-agentic path
    basic = suggestions(token)
    print("\n--- /api/stylist/suggestions (legacy/basic) ---")
    print(f"keys: {list(basic.keys())}")
    checks["basic_suggestions_no_pending_action"] = "pending_action" not in basic

    print("\n--- AGENTIC VERDICT ---")
    for k, v in checks.items():
        print(f"  {'PASS' if v else 'FAIL'}  {k}")

    failed = [k for k, v in checks.items() if not v]
    if failed:
        print(f"\n[INCONCLUSIVE/PARTIAL] failed: {failed}")
        sys.exit(2)
    print("\n[PASS] Aria stylist behaves agentically on live API")
    sys.exit(0)


if __name__ == "__main__":
    main()
