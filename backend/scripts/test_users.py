"""
Shared helpers for QA vs production Supabase auth users.

Convention
----------
- **Canonical QA account** (reuse forever): TEST_USER_EMAIL + TEST_USER_PASSWORD in
  backend/.env / Cursor Cloud secrets. Agents and Playwright should log in with
  this account — never sign up random users in the browser.
- **Disposable accounts** (smoke tests): emails on @example.com or tagged with
  user_metadata.is_test=true. Created by automated tests; safe to bulk-delete.
- **Real users**: everything else — never touched by cleanup.

There is no Supabase MCP in this repo; use these scripts via the backend venv.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Iterable, Optional

# RFC 2606 + project-specific test inboxes (never production).
EPHEMERAL_DOMAINS = frozenset({
    "example.com",
    "example.org",
    "test",
    "stylesense-test.local",
    "styleai.test",
    "test.com",
})

# Local-part prefixes created by agents / smoke tests (before @).
EPHEMERAL_LOCAL_PREFIXES = (
    "smoke-",
    "probe-",
    "test-acct-",
    "cloudagent-",
    "cloudagent-test-",
    "cloudtest+",
    "acct-bug-",
    "public-",
    "contrast-",
    "contrast-test-",
    "e2e-",
    "jwt-test-",
    "debug-",
)

DEFAULT_QA_EMAIL = "qa@stylesense.test"
DEFAULT_QA_PASSWORD = "StyleSense-QA-2026!"


def qa_email() -> str:
    return (os.getenv("TEST_USER_EMAIL") or DEFAULT_QA_EMAIL).strip().lower()


def qa_password() -> str:
    return (os.getenv("TEST_USER_PASSWORD") or DEFAULT_QA_PASSWORD).strip()


def protected_emails() -> set[str]:
    out = {qa_email(), DEFAULT_QA_EMAIL.lower(), "judge@stylesense.demo", "admin@stylesense.com"}
    extra = os.getenv("TEST_USER_PROTECTED_EMAILS", "")
    for part in extra.split(","):
        e = part.strip().lower()
        if e:
            out.add(e)
    return out


def is_ephemeral_email(email: str) -> bool:
    email = (email or "").strip().lower()
    if not email or "@" not in email:
        return False
    local, _, domain = email.partition("@")
    if email in protected_emails():
        return False
    if domain in EPHEMERAL_DOMAINS:
        return True
    return any(local.startswith(p) for p in EPHEMERAL_LOCAL_PREFIXES)


def is_ephemeral_user(user: Any) -> bool:
    email = _user_email(user)
    if email in protected_emails():
        return False
    if is_ephemeral_email(email):
        return True
    meta = _user_metadata(user)
    if meta.get("is_test") is True:
        return True
    if meta.get("test_kind"):
        return True
    return False


def test_user_metadata(kind: str, **extra: Any) -> dict[str, Any]:
    meta: dict[str, Any] = {"test_kind": kind}
    if extra.pop("is_test", True) is not False:
        meta["is_test"] = True
    meta.update(extra)
    return meta


@dataclass
class ListedUser:
    id: str
    email: str
    created_at: Optional[str]
    is_ephemeral: bool


def _user_email(user: Any) -> str:
    if isinstance(user, dict):
        return (user.get("email") or "").strip().lower()
    return (getattr(user, "email", None) or "").strip().lower()


def _user_metadata(user: Any) -> dict:
    if isinstance(user, dict):
        return user.get("user_metadata") or user.get("raw_user_meta_data") or {}
    return getattr(user, "user_metadata", None) or {}


def _user_id(user: Any) -> str:
    if isinstance(user, dict):
        return str(user["id"])
    return str(user.id)


def list_all_auth_users(admin_client) -> list[ListedUser]:
    """Paginate Supabase auth.admin.list_users."""
    out: list[ListedUser] = []
    page = 1
    while page <= 50:
        res = admin_client.auth.admin.list_users(page=page, per_page=200)
        users = res if isinstance(res, list) else getattr(res, "users", None) or []
        if not users:
            break
        for u in users:
            email = _user_email(u)
            out.append(
                ListedUser(
                    id=_user_id(u),
                    email=email,
                    created_at=getattr(u, "created_at", None) if not isinstance(u, dict) else u.get("created_at"),
                    is_ephemeral=is_ephemeral_user(u),
                )
            )
        if len(users) < 200:
            break
        page += 1
    return out


def ensure_qa_user(admin_client, *, email: Optional[str] = None, password: Optional[str] = None) -> str:
    """Create or update the canonical QA user; returns user id."""
    email = (email or qa_email()).strip().lower()
    password = (password or qa_password()).strip()
    if not password:
        raise ValueError("QA password required (set TEST_USER_PASSWORD)")

    uid = _find_user_id_by_email(admin_client, email)
    meta = test_user_metadata("qa_canonical", full_name="StyleSense QA", is_test=False)
    if uid:
        admin_client.auth.admin.update_user_by_id(uid, {
            "password": password,
            "email_confirm": True,
            "user_metadata": meta,
        })
        return uid

    created = admin_client.auth.admin.create_user({
        "email": email,
        "password": password,
        "email_confirm": True,
        "user_metadata": meta,
    })
    if not created.user:
        raise RuntimeError("create_user returned no user")
    return str(created.user.id)


def cleanup_ephemeral_users(admin_client, *, dry_run: bool = True) -> list[ListedUser]:
    """Delete disposable auth users. Returns users targeted."""
    targets = [u for u in list_all_auth_users(admin_client) if u.is_ephemeral]
    if dry_run:
        return targets
    for u in targets:
        admin_client.auth.admin.delete_user(u.id)
    return targets


def _find_user_id_by_email(admin_client, email: str) -> Optional[str]:
    email = email.lower()
    for u in list_all_auth_users(admin_client):
        if u.email == email:
            return u.id
    return None
