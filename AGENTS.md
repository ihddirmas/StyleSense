# AGENTS.md

## Cursor Cloud specific instructions

StyleSense is a monorepo: **FastAPI backend** (`backend/`, port 8000) + **Next.js 14 frontend** (`frontend/`, port 3000). See `README.md` and `CLAUDE.md` for product context.

### System dependency (one-time per VM image)

`python3.12-venv` must be installed for the backend virtualenv (`apt install python3.12-venv`). The startup update script does not install OS packages.

### Environment files (not in git)

| File | Source |
|------|--------|
| `backend/.env` | Copy from `backend/.env.example` and fill secrets |
| `frontend/.env.local` | Copy from `frontend/.env.example`; public Supabase keys are also in `frontend/.env.production` |

**Backend will not import** without Aurora config (`AURORA_IAM_AUTH` + AWS vars, or `AURORA_DATABASE_URL`) and Supabase service role (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). `services/db.py` and `services/supabase_service.py` raise at import time if missing.

When Cursor Cloud injects secrets as env vars, write both files once per session (strip trailing whitespace — injected `ANTHROPIC_API_KEY` may include a `\n` that breaks HTTP headers):

```bash
python3 - <<'PY'
import os
from pathlib import Path

def g(k, d=""): return os.environ.get(k, d).strip()

backend = "\n".join([
    f"RUNWAYML_API_SECRET={g('RUNWAYML_API_SECRET')}",
    f"SUPABASE_URL={g('SUPABASE_URL')}",
    f"SUPABASE_SERVICE_ROLE_KEY={g('SUPABASE_SERVICE_ROLE_KEY')}",
    f"SUPABASE_ANON_KEY={g('SUPABASE_ANON_KEY')}",
    f"AURORA_IAM_AUTH={g('AURORA_IAM_AUTH', 'true')}",
    f"AURORA_HOST={g('AURORA_HOST')}",
    f"AURORA_PORT={g('AURORA_PORT', '5432')}",
    f"AURORA_DB={g('AURORA_DB')}",
    f"AURORA_USER={g('AURORA_USER')}",
    f"AWS_REGION={g('AWS_REGION')}",
    f"AWS_ACCESS_KEY_ID={g('AWS_ACCESS_KEY_ID')}",
    f"AWS_SECRET_ACCESS_KEY={g('AWS_SECRET_ACCESS_KEY')}",
    f"ANTHROPIC_API_KEY={g('ANTHROPIC_API_KEY')}",
    f"FRONTEND_URL={g('FRONTEND_URL', 'http://localhost:3000')}",
]) + "\n"
Path("backend/.env").write_text(backend)

frontend = "\n".join([
    "NEXT_PUBLIC_API_URL=http://localhost:8000",
    "NEXT_PUBLIC_SITE_URL=http://localhost:3000",
    f"NEXT_PUBLIC_SUPABASE_URL={g('SUPABASE_URL')}",
    f"NEXT_PUBLIC_SUPABASE_ANON_KEY={g('SUPABASE_ANON_KEY')}",
    f"RUNWAYML_API_SECRET={g('RUNWAYML_API_SECRET')}",
]) + "\n"
Path("frontend/.env.local").write_text(frontend)
print("Wrote backend/.env and frontend/.env.local")
PY
```

### Start services (tmux recommended)

```bash
# Backend (from repo root)
cd backend && ./venv/bin/uvicorn main:app --port 8000 --log-level warning

# Frontend
cd frontend && npm run dev
```

Health check (backend only): `curl http://localhost:8000/health` → `{"status":"ok"}`.

### Lint / test / build

| Target | Command | Notes |
|--------|---------|-------|
| Backend unit tests | `cd backend && ./venv/bin/python -m pytest tests/test_image_service_unit.py -v` | No network or API keys |
| Backend smoke tests | `cd backend && ./venv/bin/python -m tests.test_supabase_smoke` (etc.) | Require full `backend/.env` |
| Frontend lint | `cd frontend && npm run lint` | Repo has pre-existing unused-var errors |
| Frontend build | `cd frontend && npm run build` | Works with `frontend/.env.local` (Supabase public keys only) |

Always use `backend/venv/bin/python` and `backend/venv/bin/pip` — never global `python`/`pip`.

### Frontend-only dev (no local backend)

With `frontend/.env.local` containing `NEXT_PUBLIC_SUPABASE_*` from `.env.production`, the UI runs and Supabase auth works (signup → `/dashboard`). Wardrobe/try-on API calls fail until `NEXT_PUBLIC_API_URL` points at a running backend.

### External services

Supabase (auth + storage + social), AWS Aurora (core tables), Runway, and Anthropic are all cloud-hosted. No Docker Compose in repo.

**Live (master):** frontend [style-sense-beryl.vercel.app](https://style-sense-beryl.vercel.app) · backend [styleai-backend-5vk9.onrender.com/health](https://styleai-backend-5vk9.onrender.com/health)

### Gotchas

- Supabase **email confirmation must be OFF** or signup hits rate limits (`CLAUDE.md`).
- Runway image URLs must be public HTTPS — localhost fails; use Supabase Storage.
- `posthog-node` warns on Node 22.14; dev still works.
- Python commands in docs use Windows paths; on Linux use `backend/venv/bin/python`.
- First dashboard load may show "Couldn't load your wardrobe" until Aurora warms up; **Retry** usually succeeds.
- `tests.test_anthropic_smoke` requires Anthropic API credits; low balance returns HTTP 400.
- Cloud test login secrets: `TEST_USER_EMAIL` + `TEST_USER_PASSWORD` (if the password secret was saved as `TEST_USER_PASSWOR`, use that env name instead).

### QA vs real users (Supabase Auth)

**Canonical QA account** (reuse forever): `TEST_USER_EMAIL` + `TEST_USER_PASSWORD` in Cursor secrets / `backend/.env`. Agents and Playwright log in at `/login` — **do not sign up new users in the UI**.

| Account type | How to identify | Cleanup |
|--------------|-----------------|---------|
| **Canonical QA** | `TEST_USER_EMAIL` | Protected — never deleted |
| **Disposable** | `@example.com`, `@stylesense-test.local`, `@styleai.test`, test prefixes, or `user_metadata.is_test=true` | `cleanup_test_users --apply` |
| **Real users** | Gmail, real domains, `judge@stylesense.demo` | Never delete |

#### Scripts (service role in `backend/.env`)

```bash
cd backend && ./venv/bin/python -m scripts.ensure_test_user
cd backend && ./venv/bin/python -m scripts.cleanup_test_users          # dry-run
cd backend && ./venv/bin/python -m scripts.cleanup_test_users --apply  # delete junk
```

Optional: `TEST_USER_PROTECTED_EMAILS=admin@stylesense.com` — extra emails cleanup must never touch.

#### Supabase MCP (audit without scripts)

Project ref: `zlgzpgqqodfrwnlephrc` (StylSense). Useful tools:

- `list_projects` — confirm connected project
- `list_tables` — row counts for `profiles`, `users`, etc.
- `execute_sql` — audit auth users (read-only checks):

```sql
-- Junk vs real breakdown
select case when email like '%@example.com' then 'example.com' else 'real' end as bucket, count(*)
from auth.users group by 1;

-- Recent signups
select email, created_at, raw_user_meta_data->>'test_kind' as test_kind
from auth.users order by created_at desc limit 20;
```

- `get_advisors` (`security` / `performance`) — RLS and config issues

MCP can **query** `auth.users` but **cannot** replace `cleanup_test_users` for deletes — use the script (Auth Admin API handles cascades safely).

**Agent rule:** log in with `TEST_USER_*`. Do not use Sign up unless testing signup itself.
