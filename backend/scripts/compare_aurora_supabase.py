"""
Compare row counts between the legacy RDS cluster and Supabase for core tables.

Uses IAM database auth when enabled (unset DATABASE_URL for the legacy leg).
Uses Supabase REST API (service role) for the Supabase leg.

    cd backend && ./venv/bin/python -m scripts.compare_aurora_supabase
    cd backend && ./venv/bin/python -m scripts.compare_aurora_supabase --ids
"""
from __future__ import annotations

import argparse
import logging
import os
from collections import Counter

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("compare_aurora_supabase")

TABLES = [
    "users",
    "wardrobe_items",
    "try_on_results",
    "outfits",
    "stylist_sessions",
    "usage_events",
]


def _aurora_engine():
    saved = os.environ.pop("DATABASE_URL", None)
    saved2 = os.environ.pop("SUPABASE_DATABASE_URL", None)
    try:
        from importlib import reload

        import services.db as dbmod

        reload(dbmod)
        return dbmod.engine, dbmod.query
    finally:
        if saved is not None:
            os.environ["DATABASE_URL"] = saved
        if saved2 is not None:
            os.environ["SUPABASE_DATABASE_URL"] = saved2


def _supabase_ids(table: str) -> set[str]:
    from services import supabase_service

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
        ids.update(str(row["id"]) for row in batch)
        if len(batch) < 1000:
            break
        offset += 1000
    return ids


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare Aurora vs Supabase core tables")
    parser.add_argument(
        "--ids",
        action="store_true",
        help="Print per-table ID deltas (only_aurora / only_supabase counts)",
    )
    parser.add_argument(
        "--wardrobe-users",
        action="store_true",
        help="Print wardrobe_items counts grouped by user_id on both sides",
    )
    args = parser.parse_args()

    _, aurora_query = _aurora_engine()
    from services import supabase_service

    logger.info("=== TOTAL ROW COUNTS (Aurora vs Supabase) ===")
    for table in TABLES:
        try:
            aur = aurora_query(f"SELECT count(*) AS c FROM {table}", fetch="one")["c"]
        except Exception as exc:  # noqa: BLE001
            logger.warning(f"{table:20} Aurora ERROR: {exc}")
            continue
        try:
            resp = (
                supabase_service.supabase.table(table)
                .select("id", count="exact")
                .limit(0)
                .execute()
            )
            sb = resp.count
        except Exception as exc:  # noqa: BLE001
            sb = f"ERROR: {exc}"
        logger.info(f"{table:20}  Aurora={aur:5}  Supabase={sb}")

    if args.ids:
        logger.info("\n=== ID DELTAS (Aurora source of truth for inserts) ===")
        for table in TABLES:
            try:
                aur_rows = aurora_query(f"SELECT id::text AS id FROM {table}", fetch="all")
                aur_ids = {r["id"] for r in aur_rows}
                sb_ids = _supabase_ids(table)
                only_aur = aur_ids - sb_ids
                only_sb = sb_ids - aur_ids
                logger.info(
                    f"{table:20}  only_aurora={len(only_aur):4}  only_supabase={len(only_sb):4}  "
                    f"overlap={len(aur_ids & sb_ids):4}"
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning(f"{table:20}  skip: {exc}")

    if args.wardrobe_users:
        logger.info("\n=== WARDROBE per user_id ===")
        aur_rows = aurora_query(
            "SELECT user_id::text AS uid, count(*)::int AS n FROM wardrobe_items GROUP BY user_id",
            fetch="all",
        )
        aur_map = {r["uid"]: r["n"] for r in aur_rows}
        sb_resp = supabase_service.supabase.table("wardrobe_items").select("user_id").execute()
        sb_counts = Counter(r["user_id"] for r in (sb_resp.data or []))
        for uid in sorted(set(aur_map) | set(sb_counts)):
            a, s = aur_map.get(uid, 0), sb_counts.get(uid, 0)
            if a != s:
                logger.info(f"  {uid}  aurora={a}  supabase={s}  delta={a - s}")


if __name__ == "__main__":
    main()
