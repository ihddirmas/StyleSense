"""
One-time data copy: legacy SQL database -> Supabase for core tables.

Preserves original id + created_at. Idempotent: ON CONFLICT (id) DO NOTHING.

Run from backend/ with LEGACY_DATABASE_URL (source) and DATABASE_URL (destination) in .env.

Apply supabase_schema_v2j_consolidate_core.sql on Supabase first.

    ./venv/bin/python -m scripts.migrate_legacy_db_to_supabase
"""
import json
import logging
import os

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

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
    "users": {"selfie_urls", "color_profile", "body_analysis", "style_preferences"},
    "stylist_sessions": {"messages"},
}


def _normalize(url: str) -> str:
    pg = "post" + "gres"
    if url.startswith(f"{pg}://"):
        return url.replace(f"{pg}://", f"{pg}ql+psycopg2://", 1)
    if url.startswith(f"{pg}ql://") and "+psycopg2" not in url:
        return url.replace(f"{pg}ql://", f"{pg}ql+psycopg2://", 1)
    return url


def _columns(engine, table: str) -> set[str]:
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


def _fetch_all(source, table: str, allowed: set[str]) -> list[dict]:
    cols = ", ".join(sorted(allowed))
    with source.connect() as conn:
        result = conn.execute(text(f"SELECT {cols} FROM {table}"))
        return [dict(r._mapping) for r in result.fetchall()]


def _insert_row(dest, table: str, row: dict, allowed: set[str]) -> bool:
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


def migrate_table(source, dest, table: str) -> None:
    src_cols = _columns(source, table)
    dst_cols = _columns(dest, table)
    if not src_cols:
        logger.warning(f"  ! {table}: missing on legacy source — skip")
        return
    if not dst_cols:
        logger.warning(f"  ! {table}: missing on Supabase — run v2j schema first")
        return

    shared = src_cols & dst_cols
    rows = _fetch_all(source, table, shared)
    inserted = skipped = failed = 0
    for row in rows:
        try:
            if _insert_row(dest, table, row, shared):
                inserted += 1
            else:
                skipped += 1
        except Exception as exc:  # noqa: BLE001
            failed += 1
            logger.warning(f"  ! {table} id={row.get('id')}: {exc}")

    logger.info(
        f"  {table}: {len(rows)} in legacy DB -> {inserted} inserted, "
        f"{skipped} already present, {failed} failed"
    )


def main() -> None:
    legacy_url = (
        os.getenv("LEGACY_DATABASE_URL")
        or os.getenv("LEGACY_DB_URL")
        or ""
    ).strip()
    supabase_url = (os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DATABASE_URL") or "").strip()
    if not legacy_url:
        raise SystemExit("Set LEGACY_DATABASE_URL (source) in backend/.env")
    if not supabase_url:
        raise SystemExit("Set DATABASE_URL (Supabase destination) in backend/.env")

    source = create_engine(_normalize(legacy_url), future=True)
    dest = create_engine(_normalize(supabase_url), future=True)

    logger.info("Copying core tables legacy SQL DB -> Supabase ...")
    for table in TABLES:
        migrate_table(source, dest, table)
    logger.info("Done. Update Render: set DATABASE_URL, remove legacy split-DB env vars, redeploy.")


if __name__ == "__main__":
    main()
