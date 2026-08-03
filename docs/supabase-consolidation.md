## Applied via Supabase MCP (2026-08-01)

On project **StylSense** (`zlgzpgqqodfrwnlephrc`):

| Migration | Contents |
|-----------|----------|
| `consolidate_core_v2j` | `usage_events`, B2 provenance columns, `cutout_url`, indexes |
| `stylist_tool_calls` | Human-in-the-loop tool proposal ledger for Aria |
| `v2l_aria_memory` | `users.aria_memory` JSONB for Phase 1 feedback |

Verify: `SELECT table_name FROM information_schema.tables WHERE table_name IN ('usage_events','stylist_tool_calls');`

**Render still needs `DATABASE_URL`** (Supabase pooler URI) before the backend uses this DB instead of Aurora.

### Legacy RDS → Supabase data copy (2026-08-03)

Ran from cloud agent with IAM source + Supabase REST API destination:

```bash
cd backend
./venv/bin/python -m scripts.compare_aurora_supabase --ids
./venv/bin/python -m scripts.migrate_legacy_db_to_supabase --dest api
./venv/bin/python -m scripts.compare_aurora_supabase --ids   # only_aurora should be 0
```

| Table | Inserted from Aurora | Notes |
|-------|---------------------|--------|
| `wardrobe_items` | 112 | Supabase now 221 rows (42 legacy-only rows kept) |
| `try_on_results` | 45 | Supabase now 113 rows (7 legacy-only kept) |
| `outfits` | 20 | Supabase now 36 rows |
| `stylist_sessions` | 15 | Was 0 on Supabase |
| `users` | 0 | All 56 Aurora users already existed on Supabase |

Image URLs unchanged (Supabase Storage / B2 pointers in row columns).

**Duplicate users:** Supabase may have *more* rows per user than Aurora for overlapping IDs (insert-only migration). Rows only on Supabase were not deleted. Use `compare_aurora_supabase --wardrobe-users` to audit.

### Live verification (Supabase MCP, 2026-08-02)

| Check | Result |
|-------|--------|
| Migrations applied | `consolidate_core_v2j`, `stylist_tool_calls` |
| `usage_events` + `stylist_tool_calls` tables | present |
| B2 cols on `try_on_results` | `b2_image_url`, `b2_video_url`, manifest hashes |
| Test user wardrobe in Supabase | **53** items (seed account) |
| Production API wardrobe (still Aurora) | **39** items — split-DB confirmed |

Render `DATABASE_URL`: Supabase Dashboard → Database → Connect → transaction pooler on port 6543 (ap-northeast-1).


## Cutover steps (production)

1. **Supabase SQL Editor** — run `backend/supabase_schema_v2j_consolidate_core.sql` + `v2l_aria_memory` (idempotent).

2. **Copy data** (if production was on Aurora):
   ```bash
   cd backend
   # IAM auth env vars + AWS creds (no LEGACY_DATABASE_URL needed)
   # Or: LEGACY_DATABASE_URL=<legacy-sql-connection-string>
   # DATABASE_URL=Supabase pooler URI (optional if pooler unreachable from your host)
   ./venv/bin/python -m scripts.compare_aurora_supabase --ids
   ./venv/bin/python -m scripts.migrate_legacy_db_to_supabase --dest api   # or omit --dest if pooler works
   ./venv/bin/python -m scripts.compare_aurora_supabase --ids   # only_aurora must be 0
   ```

3. **Render** — set `DATABASE_URL` to the Supabase **transaction pooler** URI from Dashboard → Database → Connect (port 6543, ap-northeast-1).
   Remove legacy RDS IAM env vars and AWS credentials used only for the split-DB cutover.

4. **Verify** — `curl https://styleai-backend-5vk9.onrender.com/health` → `db_ok: true`; wardrobe loads on production frontend.

## Local dev

`backend/.env` needs `DATABASE_URL` (Supabase connection string from Dashboard → Database).

Use `scripts/check_db.py` for connectivity checks.
