"""SQL database connection for StyleSense core relational tables.

All domain data (users, wardrobe, try-ons, outfits, stylist sessions, usage caps)
lives in **Supabase** — same project as Auth, Storage, and social tables.

Set `DATABASE_URL` to the Supabase connection string:
  Dashboard → Project Settings → Database → Connection string (URI).
Use the **transaction pooler** (port 6543) for Render/serverless; session mode (5432)
is fine for local dev.

The thin `query()` helper returns plain dicts so callers match the previous style.
"""
import os
import logging
import uuid
from typing import Any, Optional

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


def _normalize_database_url(url: str) -> str:
    """Ensure SQLAlchemy + psycopg2 driver prefix."""
    pg = "post" + "gres"
    if url.startswith(f"{pg}://"):
        return url.replace(f"{pg}://", f"{pg}ql+psycopg2://", 1)
    if url.startswith(f"{pg}ql://") and "+psycopg2" not in url:
        return url.replace(f"{pg}ql://", f"{pg}ql+psycopg2://", 1)
    return url


def _resolve_database_url() -> str:
    url = (os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DATABASE_URL") or "").strip()
    if url:
        return _normalize_database_url(url)
    legacy = (
        os.getenv("LEGACY_DATABASE_URL")
        or os.getenv("LEGACY_DB_URL")
        or ""
    ).strip()
    if legacy:
        logger.warning(
            "Using deprecated LEGACY_DATABASE_URL — set DATABASE_URL to Supabase and run "
            "scripts/migrate_legacy_db_to_supabase.py"
        )
        return _normalize_database_url(legacy)
    raise RuntimeError(
        "Missing DATABASE_URL (or SUPABASE_DATABASE_URL). "
        "Supabase Dashboard → Project Settings → Database → Connection string."
    )


engine: Engine = create_engine(
    _resolve_database_url(),
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=5,
    pool_recycle=900,
    future=True,
)


def query(sql: str, params: Optional[dict] = None, fetch: str = "all") -> Any:
    """
    Run a parameterized statement and return dicts.

    Args:
        sql: SQL with :named placeholders.
        params: bound parameters.
        fetch: "all" -> list[dict], "one" -> dict | None, "none" -> None.

    INSERT/UPDATE/DELETE statements should add `RETURNING *` and use fetch="one"
    or "all" to get the affected rows back.
    """
    with engine.begin() as conn:
        result = conn.execute(text(sql), params or {})
        if fetch == "none":
            return None
        if fetch == "one":
            row = result.first()
            return _row_to_dict(row) if row else None
        return [_row_to_dict(r) for r in result.fetchall()]


def _coerce(v: Any) -> Any:
    if isinstance(v, uuid.UUID):
        return str(v)
    if isinstance(v, list):
        return [str(x) if isinstance(x, uuid.UUID) else x for x in v]
    return v


def _row_to_dict(row) -> dict:
    return {k: _coerce(v) for k, v in row._mapping.items()}
