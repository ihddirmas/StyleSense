## Applied via Supabase MCP (2026-08-01)

On project **StylSense** (`zlgzpgqqodfrwnlephrc`):

| Migration | Contents |
|-----------|----------|
| `consolidate_core_v2j` | `usage_events`, B2 provenance columns, `cutout_url`, indexes |
| `stylist_tool_calls` | Human-in-the-loop tool proposal ledger for Aria |

Verify: `SELECT table_name FROM information_schema.tables WHERE table_name IN ('usage_events','stylist_tool_calls');`

**Render still needs `DATABASE_URL`** (Supabase pooler URI) before the backend uses this DB instead of Aurora.


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
