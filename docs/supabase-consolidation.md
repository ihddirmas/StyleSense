# Supabase consolidation

Core relational tables are back on **Supabase** (single database with Auth, Storage, social).

## Cutover steps (production)

1. **Supabase SQL Editor** — run `backend/supabase_schema_v2j_consolidate_core.sql` (idempotent).

2. **Copy data** (if the old split-DB cluster has newer rows than Supabase):
   ```bash
   cd backend
   # .env: LEGACY_DATABASE_URL (source) + DATABASE_URL (Supabase)
   ./venv/bin/python -m scripts.migrate_legacy_db_to_supabase
   ```

3. **Render** — set `DATABASE_URL` to the Supabase pooler URI; remove legacy split-DB env vars.

4. **Verify** — `./venv/bin/python -m scripts.check_db` and smoke-test wardrobe + Aria chat.

## Local dev

`backend/.env` needs `DATABASE_URL` (Supabase connection string from Dashboard → Database).

Use `scripts/check_db.py` for connectivity checks.
