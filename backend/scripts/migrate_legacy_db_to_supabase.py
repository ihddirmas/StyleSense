"""
One-time data copy: legacy SQL database -> Supabase.

Preserves original id + created_at. Idempotent: ON CONFLICT (id) DO NOTHING.

Sources (pick one):
  - LEGACY_DATABASE_URL / LEGACY_DB_URL — connection string
  - IAM auth env vars — same as production Render when direct URL is unset

Destinations (pick one):
  - DATABASE_URL / SUPABASE_DATABASE_URL — direct SQL (pooler port 6543 on Render)
  - --dest api — Supabase REST API via service role (when pooler unreachable)

Apply supabase_schema_v2j_consolidate_core.sql on Supabase first.

    ./venv/bin/python -m scripts.compare_aurora_supabase --ids
    ./venv/bin/python -m scripts.migrate_legacy_db_to_supabase --dry-run
    ./venv/bin/python -m scripts.migrate_legacy_db_to_supabase --dest api
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("migrate_legacy_db_to_supabase")

TABLES = [
    "users",
    "wardrobe_items",
    "try_on_results",
    "outfits",
    "stylist_sessions",
    "usage_events",
]

ARRAY_COLS = {
    "wardrobe_items": {"tags": "text[]"},
    "outfits": {"item_ids": "uuid[]"},
}
JSONB_COLS = {
    "users": {
        "selfie_urls",
        "color_profile",
        "body_analysis",
        "style_preferences",
        "kibbe_analysis",
        "aria_memory",
    },
    "stylist_sessions": {"messages"},
}

BATCH_SIZE = 100


def _normalize(url: str) -> str:
    pg = "post" + "gres"
    if url.startswith(f"{pg}://"):
        return url.replace(f"{pg}://", f"{pg}ql+psycopg2://", 1)
    if url.startswith(f"{pg}ql://") and "+psycopg2" not in url:
        return url.replace(f"{pg}ql://", f"{pg}ql+psycopg2://", 1)
    return url


def _truthy(val: Optional[str]) -> bool:
    return (val or "").strip().lower() in ("1", "true", "yes", "on")


def _build_aurora_engine() -> Engine:
    saved = os.environ.pop("DATABASE_URL", None)
    saved2 = os.environ.pop("SUPABASE_DATABASE_URL", None)
    try:
        from importlib import reload

        import services.db as dbmod

        reload(dbmod)
        logger.info("Source: legacy RDS (IAM)")
        return dbmod.engine
    finally:
        if saved is not None:
            os.environ["DATABASE_URL"] = saved
        if saved2 is not None:
            os.environ["SUPABASE_DATABASE_URL"] = saved2


def _build_source_engine() -> Engine:
    legacy_url = (
        os.getenv("LEGACY_DATABASE_URL")
        or os.getenv("LEGACY_DB_URL")
        or ""
    ).strip()
    if legacy_url:
        logger.info("Source: LEGACY_DATABASE_URL")
        return create_engine(_normalize(legacy_url), future=True)
    if _truthy(os.getenv("AURORA_IAM_AUTH")):
        return _build_aurora_engine()
    raise SystemExit(
        "Set LEGACY_DATABASE_URL (source) or enable legacy RDS IAM auth with AWS creds"
    )


def _columns(engine: Engine, table: str) -> set[str]:
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = :t
                """
            ),
            {"t": table},
        ).fetchall()
    return {r[0] for r in rows}


def _supabase_columns(table: str, source_cols: set[str]) -> set[str]:
    from services import supabase_service

    resp = supabase_service.supabase.table(table).select("*").limit(1).execute()
    if resp.data:
        return set(resp.data[0].keys())
    logger.warning(f"  {table}: empty on Supabase — matching source columns to destination")
    return source_cols


def _build_dest_engine_from_url() -> Engine:
    supabase_url = (
        os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DATABASE_URL") or ""
    ).strip()
    if not supabase_url:
        raise SystemExit("Set DATABASE_URL (Supabase destination) or pass --dest api")
    return create_engine(_normalize(supabase_url), future=True)


def _fetch_all(source: Engine, table: str, allowed: set[str]) -> list[dict]:
    cols = ", ".join(sorted(allowed))
    with source.connect() as conn:
        result = conn.execute(text(f"SELECT {cols} FROM {table}"))
        return [dict(r._mapping) for r in result.fetchall()]


def _serialize_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, list):
        return [_serialize_value(v) for v in value]
    if isinstance(value, dict):
        return {k: _serialize_value(v) for k, v in value.items()}
    return value


def _jsonify_row(row: dict, table: str) -> dict:
    jsonb = JSONB_COLS.get(table, set())
    out: dict[str, Any] = {}
    for key, value in row.items():
        value = _serialize_value(value)
        if key in jsonb and value is not None and not isinstance(value, (dict, list)):
            try:
                out[key] = json.loads(value) if isinstance(value, str) else value
            except json.JSONDecodeError:
                out[key] = value
        else:
            out[key] = value
    return out


def _insert_row_sql(dest: Engine, table: str, row: dict, allowed: set[str]) -> bool:
    arr = ARRAY_COLS.get(table, {})
    jsonb = JSONB_COLS.get(table, set())
    cols, placeholders, params = [], [], {}

    for key, value in row.items():
        if key not in allowed:
            continue
        cols.append(key)
        if key in arr:
            placeholders.append(f"(:{key})::{arr[key]}")
            params[key] = value if value is not None else []
        elif key in jsonb:
            placeholders.append(f"CAST(:{key} AS JSONB)")
            if isinstance(value, (dict, list)):
                params[key] = json.dumps(value)
            else:
                params[key] = value
        else:
            placeholders.append(f":{key}")
            params[key] = value

    sql = text(
        f"""
        INSERT INTO {table} ({", ".join(cols)})
        VALUES ({", ".join(placeholders)})
        ON CONFLICT (id) DO NOTHING
        RETURNING id
        """
    )
    with dest.begin() as conn:
        result = conn.execute(sql, params)
        return result.first() is not None


def _insert_batch_api(table: str, rows: list[dict], allowed: set[str]) -> tuple[int, int, int]:
    from services import supabase_service

    if not rows:
        return 0, 0, 0
    payload = [_jsonify_row({k: v for k, v in row.items() if k in allowed}, table) for row in rows]
    try:
        resp = (
            supabase_service.supabase.table(table)
            .upsert(payload, on_conflict="id", ignore_duplicates=True)
            .execute()
        )
        inserted = len(resp.data or [])
        skipped = len(rows) - inserted
        return inserted, skipped, 0
    except Exception as exc:  # noqa: BLE001
        inserted = skipped = 0
        failed = len(rows)
        logger.warning(f"  ! {table} batch ({len(rows)} rows): {exc}")
        return inserted, skipped, failed


def migrate_table(
    source: Engine,
    dest_mode: str,
    dest_engine: Optional[Engine],
    table: str,
    dry_run: bool,
    existing_sb_ids: Optional[set[str]] = None,
) -> None:
    src_cols = _columns(source, table)
    if dest_mode == "api":
        dst_cols = _supabase_columns(table, src_cols)
    else:
        assert dest_engine is not None
        dst_cols = _columns(dest_engine, table)

    if not src_cols:
        logger.warning(f"  ! {table}: missing on source — skip")
        return
    if not dst_cols:
        logger.warning(f"  ! {table}: missing on Supabase — run v2j schema first")
        return

    shared = src_cols & dst_cols
    rows = _fetch_all(source, table, shared)
    would_insert = 0
    if existing_sb_ids is not None:
        would_insert = sum(1 for r in rows if str(r.get("id")) not in existing_sb_ids)

    if dry_run:
        logger.info(
            f"  {table}: {len(rows)} in source, ~{would_insert} new ids "
            f"(skip {len(rows) - would_insert} already in Supabase)"
        )
        return

    inserted = skipped = failed = 0
    if dest_mode == "api":
        for i in range(0, len(rows), BATCH_SIZE):
            batch = rows[i : i + BATCH_SIZE]
            ins, sk, fl = _insert_batch_api(table, batch, shared)
            inserted += ins
            skipped += sk
            failed += fl
    else:
        assert dest_engine is not None
        for row in rows:
            try:
                if _insert_row_sql(dest_engine, table, row, shared):
                    inserted += 1
                else:
                    skipped += 1
            except Exception as exc:  # noqa: BLE001
                failed += 1
                logger.warning(f"  ! {table} id={row.get('id')}: {exc}")

    logger.info(
        f"  {table}: {len(rows)} in source -> {inserted} inserted, "
        f"{skipped} already present, {failed} failed"
    )


def _load_supabase_id_sets() -> dict[str, set[str]]:
    from services import supabase_service

    out: dict[str, set[str]] = {}
    for table in TABLES:
        ids: set[str] = set()
        offset = 0
        while True:
            resp = (
                supabase_service.supabase.table(table)
                .select("id")
                .range(offset, offset + 999)
                .execute()
            )
            batch = resp.data or []
            if not batch:
                break
            ids.update(str(r["id"]) for r in batch)
            if len(batch) < 1000:
                break
            offset += 1000
        out[table] = ids
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Copy core tables from legacy RDS to Supabase")
    parser.add_argument(
        "--dest",
        choices=("auto", "sql", "api"),
        default="auto",
        help="Supabase destination: sql URL, REST api, or auto-try sql then api",
    )
    parser.add_argument("--dry-run", action="store_true", help="Count rows that would insert only")
    args = parser.parse_args()

    source = _build_source_engine()
    dest_mode = args.dest
    dest_engine: Optional[Engine] = None

    if dest_mode in ("auto", "sql"):
        try:
            dest_engine = _build_dest_engine_from_url()
            with dest_engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            dest_mode = "sql"
            logger.info("Destination: DATABASE_URL (direct SQL)")
        except Exception as exc:  # noqa: BLE001
            if dest_mode == "sql":
                raise SystemExit(f"DATABASE_URL connection failed: {exc}") from exc
            logger.warning("DATABASE_URL unreachable (%s) — falling back to --dest api", exc)
            dest_mode = "api"

    if dest_mode == "api":
        logger.info("Destination: Supabase REST API (service role)")

    sb_ids = _load_supabase_id_sets() if args.dry_run else None

    logger.info("Copying core tables -> Supabase ...")
    for table in TABLES:
        migrate_table(
            source,
            dest_mode,
            dest_engine,
            table,
            args.dry_run,
            existing_sb_ids=sb_ids.get(table) if sb_ids else None,
        )
    if args.dry_run:
        logger.info("Dry run complete. Re-run without --dry-run to apply.")
    else:
        logger.info(
            "Done. On Render: set DATABASE_URL to the Supabase pooler URI, "
            "remove legacy RDS IAM env vars, redeploy."
        )


if __name__ == "__main__":
    main()
