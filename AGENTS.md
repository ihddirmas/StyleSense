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

**Backend will not import** without `DATABASE_URL` (Supabase DB URI) and Supabase service role (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). `services/db.py` and `services/supabase_service.py` raise at import time if missing.

When Cursor Cloud injects secrets as env vars, write both files once per session (strip trailing whitespace — injected `ANTHROPIC_API_KEY` may include a `\n` that breaks HTTP headers). If `DATABASE_URL` is unset in the shell but present in `backend/.env` as Aurora fallback, the script preserves Aurora lines until the Supabase secret is injected (new agent session after adding the secret).

```bash
python3 - <<'PY'
import os
from pathlib import Path

def g(k, d=""): return (os.environ.get(k, d) or "").strip()

lines = [
    f"RUNWAYML_API_SECRET={g('RUNWAYML_API_SECRET')}",
    f"SUPABASE_URL={g('SUPABASE_URL')}",
    f"SUPABASE_SERVICE_ROLE_KEY={g('SUPABASE_SERVICE_ROLE_KEY')}",
    f"SUPABASE_ANON_KEY={g('SUPABASE_ANON_KEY')}",
    f"ANTHROPIC_API_KEY={g('ANTHROPIC_API_KEY')}",
    f"FRONTEND_URL={g('FRONTEND_URL', 'http://localhost:3000')}",
]
db = g("DATABASE_URL") or g("SUPABASE_DATABASE_URL")
if db:
    lines.append(f"DATABASE_URL={db}")
else:
    existing = Path("backend/.env").read_text() if Path("backend/.env").exists() else ""
    for key in ("AURORA_IAM_AUTH", "AURORA_HOST", "AURORA_PORT", "AURORA_DB", "AURORA_USER",
                "AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"):
        for line in existing.splitlines():
            if line.startswith(key + "="):
                lines.append(line)
                break
for key in ("B2_BUCKET", "B2_REGION", "B2_KEY_ID", "B2_APP_KEY", "B2_PUBLIC_URL_BASE", "B2_ENDPOINT"):
    v = g(key)
    if v:
        lines.append(f"{key}={v}")
if g("B2_BUCKET") and g("B2_KEY_ID") and g("B2_APP_KEY"):
    lines.append("GENBLAZE_MEDIA=1")
for key in ("TEST_USER_EMAIL", "TEST_USER_PASSWORD", "TEST_USER_PASSWOR"):
    v = g(key)
    if v:
        lines.append(f"TEST_USER_PASSWORD={v}" if key == "TEST_USER_PASSWOR" else f"{key}={v}")
Path("backend/.env").write_text("\n".join(lines) + "\n")

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

Health check (backend only): `curl http://localhost:8000/health` → `{"status":"ok","b2_configured":true,...}` when B2 secrets are set. If you only see `{"status":"ok"}`, an old uvicorn process may still own port 8000 — `fuser -k 8000/tcp` then restart backend.

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

Supabase (auth + storage + social + core DB), Runway, and Anthropic are cloud-hosted. No Docker Compose in repo.

### Gotchas

- Supabase **email confirmation must be OFF** or signup hits rate limits (`CLAUDE.md`).
- Runway image URLs must be public HTTPS — localhost fails; use Supabase Storage.
- `posthog-node` warns on Node 22.14; dev still works.
- Python commands in docs use Windows paths; on Linux use `backend/venv/bin/python`.
- First dashboard load may fail wardrobe until `DATABASE_URL` is set and Supabase schema is applied; **Retry** after fixing env.
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
