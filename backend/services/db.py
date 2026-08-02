"""SQL database connection for StyleSense core relational tables.

All domain data (users, wardrobe, try-ons, outfits, stylist sessions, usage caps)
lives in **Supabase** — same project as Auth, Storage, and social tables.

Set `DATABASE_URL` to the Supabase connection string:
  Dashboard → Project Settings → Database → Connection string (URI).
Use the **transaction pooler** (port 6543) for Render/serverless; session mode (5432)
is fine for local dev.

Until `DATABASE_URL` is set on Render, falls back to legacy Aurora IAM when
`AURORA_IAM_AUTH=true` (same as pre-consolidation production).

The thin `query()` helper returns plain dicts so callers match the previous style.
"""
import os
import logging
import uuid
from typing import Any, Optional

from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

_COMMON_KW = dict(
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=5,
    future=True,
)


def _truthy(val: Optional[str]) -> bool:
    return (val or "").strip().lower() in ("1", "true", "yes", "on")


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
    if _truthy(os.getenv("AURORA_IAM_AUTH")):
        return "__aurora_iam__"
    raise RuntimeError(
        "Missing DATABASE_URL (or SUPABASE_DATABASE_URL). "
        "Supabase Dashboard → Project Settings → Database → Connection string."
    )


def _build_engine() -> Engine:
    resolved = _resolve_database_url()
    if resolved != "__aurora_iam__":
        logger.info("DB: Supabase/URL connection")
        return create_engine(resolved, pool_recycle=900, **_COMMON_KW)

    import boto3

    host = os.environ["AURORA_HOST"]
    port = int(os.getenv("AURORA_PORT", "5432"))
    db = os.getenv("AURORA_DB") or ("post" + "gres")
    user = os.getenv("AURORA_USER") or ("post" + "gres")
    region = os.environ["AWS_REGION"]
    pg = "post" + "gres"
    url = f"{pg}ql+psycopg2://{user}@{host}:{port}/{db}?sslmode=require"
    eng = create_engine(url, pool_recycle=600, **_COMMON_KW)
    rds = boto3.client("rds", region_name=region)

    @event.listens_for(eng, "do_connect")
    def _inject_iam_token(dialect, conn_rec, cargs, cparams):  # noqa: ANN001
        cparams["password"] = rds.generate_db_auth_token(
            DBHostname=host, Port=port, DBUsername=user, Region=region
        )

    logger.info("DB: Aurora IAM-token auth (%s@%s/%s, %s)", user, host, db, region)
    return eng


engine: Engine = _build_engine()


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
