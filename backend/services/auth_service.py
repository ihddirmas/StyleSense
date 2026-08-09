"""Verify Supabase JWT and resolve the current user from a request.

We verify locally using the Supabase JWT secret (avoids round-tripping to Supabase
on every request). The secret is the legacy 'JWT secret' from the Supabase project
settings - NOT the same as the anon/service-role keys.

For simplicity in the hackathon, we also support verifying via the Supabase REST API
(supabase.auth.get_user(token)) when the JWT secret isn't configured.
"""
import asyncio
import os
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Optional
from fastapi import Header, HTTPException, Depends
from supabase import create_client

logger = logging.getLogger(__name__)

_SUPABASE_URL = os.getenv("SUPABASE_URL")
_SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
_anon_client = None
_anon_client_lock = threading.Lock()

# Dedicated pool, not the process-wide default executor: current_user runs on
# virtually every authenticated request, and the default executor is also used
# by long-running Runway generation calls elsewhere (avatar_pose_service,
# wardrobe_add_service). Sharing it would let a handful of slow generation jobs
# starve auth resolution for every other endpoint -- the same class of bug this
# offload is meant to fix, just moved from the event loop to the thread pool.
_executor = ThreadPoolExecutor(max_workers=8, thread_name_prefix="auth")


def _get_anon_client():
    """A separate client for token verification (uses service role to call auth admin API).
    Double-checked locking: this now runs from multiple executor threads concurrently
    (not just interleaved coroutines under the GIL), so the lazy-init check-then-act
    needs a real lock to avoid racing to construct duplicate clients on cold start."""
    global _anon_client
    if _anon_client is None:
        with _anon_client_lock:
            if _anon_client is None:
                _anon_client = create_client(_SUPABASE_URL, _SUPABASE_SERVICE_KEY)
    return _anon_client


def _verify_token_via_api(token: str) -> dict:
    """Ask Supabase to validate the JWT and return the user. ~50ms round trip."""
    client = _get_anon_client()
    try:
        # supabase.auth.get_user(jwt) returns a UserResponse
        res = client.auth.get_user(token)
        if not res or not res.user:
            raise HTTPException(401, "Invalid token")
        return {"id": res.user.id, "email": res.user.email}
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"JWT verification failed: {e}")
        raise HTTPException(401, "Invalid or expired token")


def _resolve_current_user_sync(token: str) -> dict:
    """Blocking body of current_user: JWT verification is a real Supabase network
    round-trip, and ensure_user is a real Aurora DB round-trip. Run via executor
    (see current_user) so neither stalls the asyncio event loop for every other
    in-flight request on this worker."""
    user = _verify_token_via_api(token)

    # The Supabase handle_new_user() trigger creates the `profiles` row, but `users`
    # now lives in Aurora and the trigger can't reach it - so provision it lazily here.
    # Best-effort: a transient failure isn't fatal because writes upsert with
    # ON CONFLICT and reads tolerate a missing row.
    try:
        from services import supabase_service
        supabase_service.ensure_user(user["id"], user.get("email"))
    except Exception as e:  # noqa: BLE001
        logger.warning(f"ensure_user failed for {user.get('id')}: {e}")

    return user


async def current_user(authorization: Optional[str] = Header(None)) -> dict:
    """
    FastAPI dependency: returns {id, email} for the authenticated user.
    Raises 401 if missing or invalid.

    Usage:
        @router.get("/me")
        async def me(user = Depends(current_user)):
            return user
    """
    if not authorization:
        raise HTTPException(401, "Missing Authorization header")
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(401, "Authorization header must be 'Bearer <token>'")
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, _resolve_current_user_sync, parts[1])


async def optional_user(authorization: Optional[str] = Header(None)) -> Optional[dict]:
    """Same as current_user but returns None instead of 401 if missing/invalid."""
    if not authorization:
        return None
    try:
        return await current_user(authorization)
    except HTTPException:
        return None


# Convenience for routes that take user_id in path/body and want to ensure it matches
def require_self(user_id: str, current: dict) -> None:
    if str(user_id) != str(current["id"]):
        raise HTTPException(403, "You can only access your own data.")
