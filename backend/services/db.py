"""Aurora PostgreSQL connection + a thin query helper.

Holds the core relational domain tables (users, wardrobe_items, try_on_results,
outfits) for the AWS hackathon. Supabase still owns Auth, Storage, and the social
tables (profiles, friendships, messages) - see supabase_service.py.

The helper returns plain dicts so it is a drop-in for the previous Supabase
`.execute().data` style: callers keep returning dict / list[dict] exactly as before.
"""
import os
import logging
import uuid
from typing import Any, Optional

from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


def _truthy(val: Optional[str]) -> bool:
    return (val or "").strip().lower() in ("1", "true", "yes", "on")


# Two ways to reach Aurora:
#   - IAM mode (AURORA_IAM_AUTH=true): no DB password; the backend mints a short-lived
#     (~15 min) IAM auth token per connection. Required by the free-plan "IAM only"
#     cluster. Needs AWS creds (AWS_ACCESS_KEY_ID/SECRET) + AWS_REGION in the env.
#   - Password mode: a full AURORA_DATABASE_URL (postgresql+psycopg2://user:pass@...).
_IAM_AUTH = _truthy(os.getenv("AURORA_IAM_AUTH"))

_COMMON_KW = dict(
    pool_pre_ping=True,   # revive connections dropped by idle timeout / scale-to-zero resume
    pool_size=5,
    max_overflow=5,
    future=True,
)

if _IAM_AUTH:
    import boto3

    _HOST = os.environ["AURORA_HOST"]
    _PORT = int(os.getenv("AURORA_PORT", "5432"))
    _DB = os.getenv("AURORA_DB", "postgres")
    _USER = os.getenv("AURORA_USER", "postgres")
    _REGION = os.environ["AWS_REGION"]

    # No password in the URL - it is injected per-connection by the do_connect hook below.
    # sslmode=require is mandatory: IAM auth only works over TLS.
    _url = f"postgresql+psycopg2://{_USER}@{_HOST}:{_PORT}/{_DB}?sslmode=require"
    engine: Engine = create_engine(
        _url,
        pool_recycle=600,  # < token lifetime, so reconnects always carry a fresh token
        **_COMMON_KW,
    )

    _rds = boto3.client("rds", region_name=_REGION)

    @event.listens_for(engine, "do_connect")
    def _inject_iam_token(dialect, conn_rec, cargs, cparams):  # noqa: ANN001
        cparams["password"] = _rds.generate_db_auth_token(
            DBHostname=_HOST, Port=_PORT, DBUsername=_USER, Region=_REGION
        )

    logger.info("Aurora: IAM-token auth (%s@%s/%s, %s)", _USER, _HOST, _DB, _REGION)
else:
    _DATABASE_URL = os.getenv("AURORA_DATABASE_URL")
    if not _DATABASE_URL:
        raise RuntimeError(
            "No Aurora config found in backend/.env. Either set AURORA_IAM_AUTH=true "
            "with AURORA_HOST / AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY "
            "(IAM-only cluster), or set AURORA_DATABASE_URL "
            "(postgresql+psycopg2://<user>:<pass>@<endpoint>:5432/<db>?sslmode=require)."
        )
    engine = create_engine(_DATABASE_URL, pool_recycle=900, **_COMMON_KW)


def query(sql: str, params: Optional[dict] = None, fetch: str = "all") -> Any:
    """
    Run a parameterized statement and return dicts.

    Args:
        sql: SQL with :named placeholders.
        params: bound parameters.
        fetch: "all" -> list[dict], "one" -> dict | None, "none" -> None.

    INSERT/UPDATE/DELETE statements should add `RETURNING *` and use fetch="one"
    or "all" to get the affected rows back (mirrors Supabase's .execute().data).
    """
    try:
        with engine.begin() as conn:
            result = conn.execute(text(sql), params or {})
            if fetch == "none":
                return None
            if fetch == "one":
                row = result.first()
                return _row_to_dict(row) if row else None
            return [_row_to_dict(r) for r in result.fetchall()]
    except Exception as e:
        # IAM tokens expire after ~15 min; if a pooled connection is stale, dispose
        # the pool and retry once so the do_connect hook generates a fresh token.
        msg = str(e).lower()
        if "password authentication failed" in msg or "pg_hba" in msg or "expired" in msg:
            logger.warning("Stale IAM token detected, disposing pool and retrying: %s", e)
            engine.dispose()
            with engine.begin() as conn:
                result = conn.execute(text(sql), params or {})
                if fetch == "none":
                    return None
                if fetch == "one":
                    row = result.first()
                    return _row_to_dict(row) if row else None
                return [_row_to_dict(r) for r in result.fetchall()]
        raise


def _coerce(v: Any) -> Any:
    # psycopg2 returns UUID columns as uuid.UUID objects; the old Supabase client
    # returned strings. Coerce back to str so id comparisons (e.g. ownership checks)
    # and JSON keys behave exactly as before. Handles UUID[] columns (lists) too.
    if isinstance(v, uuid.UUID):
        return str(v)
    if isinstance(v, list):
        return [str(x) if isinstance(x, uuid.UUID) else x for x in v]
    return v


def _row_to_dict(row) -> dict:
    return {k: _coerce(v) for k, v in row._mapping.items()}
