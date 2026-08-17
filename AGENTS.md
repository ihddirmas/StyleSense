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
if db and not db.startswith("http"):
    lines.append(f"DATABASE_URL={db}")
elif db:
    print("SKIP invalid DATABASE_URL — use the Database connection URI, not the project HTTPS URL")
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

Supabase (auth + storage + social), AWS Aurora (core tables), Runway, and Anthropic are all cloud-hosted. No Docker Compose in repo.

**Live (master):** frontend [style-sense-beryl.vercel.app](https://style-sense-beryl.vercel.app) · backend [styleai-backend-5vk9.onrender.com/health](https://styleai-backend-5vk9.onrender.com/health)
Supabase (auth + storage + social + core DB), Runway, and Anthropic are cloud-hosted. No Docker Compose in repo.

### Gotchas

- **Aurora SSL cert verify failure (Windows, local dev)**: if `~/.postgresql/root.crt` exists, libpq 13+ silently upgrades `sslmode=require` to verify-ca and Aurora fails with `certificate verify failed` (Aurora chains via Amazon's generic "RSA 2048 M01" intermediate, not in the RDS-only bundle). Fix: `backend/.ssl/rds-combined.pem` (gitignored) — RDS global bundle + Amazon Root CA 1 concatenated; `services/db.py` picks it up automatically (or set `PGSSLROOTCERT`). Regenerate: `curl -fsSL https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem` + `curl -fsSL https://www.amazontrust.com/repository/AmazonRootCA1.pem`, concat both.
- Supabase **email confirmation must be OFF** or signup hits rate limits (`CLAUDE.md`).
- Runway image URLs must be public HTTPS — localhost fails; use Supabase Storage.
- `posthog-node` warns on Node 22.14; dev still works.
- Python commands in docs use Windows paths; on Linux use `backend/venv/bin/python`.
- First dashboard load may fail wardrobe until `DATABASE_URL` is set and Supabase schema is applied; **Retry** after fixing env.
- **`DATABASE_URL` must be the database connection URI** from Supabase Dashboard → Database (pooler port **6543**), **not** the `https://` project URL. Fix on Render and Cursor secrets.
- `tests.test_anthropic_smoke` requires Anthropic API credits; low balance returns HTTP 400.
- Cloud test login secrets: `TEST_USER_EMAIL` + `TEST_USER_PASSWORD` (if the password secret was saved as `TEST_USER_PASSWOR`, use that env name instead).

### QA vs real users (Supabase Auth)

**Canonical QA account**: `TEST_USER_EMAIL` + `TEST_USER_PASSWORD` in Cursor secrets. Prefer a **seed account with wardrobe data** (below) as `TEST_USER_EMAIL` so Studio/wardrobe E2E has real items. Log in at `/login` — **do not sign up new users in the UI**.

| Account type | How to identify | Cleanup |
|--------------|-----------------|---------|
| **Canonical QA** | `TEST_USER_EMAIL` | Protected — never deleted |
| **Seed wardrobes** | ellbit / anawebs / judge seeds (`SEED_ACCOUNTS` in `scripts/test_users.py`) | Protected — never deleted |
| **Disposable** | `@example.com`, `@stylesense-test.local`, `@styleai.test`, test prefixes, or `user_metadata.is_test=true` | `cleanup_test_users --apply` |
| **Other real users** | Gmail, etc. | Never delete |

#### Seed accounts (wardrobe / demo data)

Add passwords in **Cursor Cloud secrets** (do not paste in chat or commit):

| Secret | Default email | Use |
|--------|---------------|-----|
| `TEST_SEED_ELLBIT_PASSWORD` | ellbit seed user (default in `scripts/test_users.py`) | Primary E2E (~53 wardrobe items) — good default for `TEST_USER_EMAIL` |
| `TEST_SEED_ANAWEBS_PASSWORD` | anawebs seed user (default in `scripts/test_users.py`) | Alternate wardrobe (~46 items) |
| `TEST_SEED_JUDGE_PASSWORD` | judge demo user (default in `scripts/test_users.py`) | Demo / judge walkthrough |

Optional overrides: `TEST_SEED_ELLBIT_EMAIL`, `TEST_SEED_ANAWEBS_EMAIL`, `TEST_SEED_JUDGE_EMAIL`.

Set `TEST_USER_EMAIL` to the ellbit seed address and `TEST_USER_PASSWORD` to the matching seed password.

#### Scripts (service role in `backend/.env`)

```bash
cd backend && ./venv/bin/python -m scripts.ensure_test_user
cd backend && ./venv/bin/python -m scripts.ensure_seed_users   # sync TEST_SEED_*_PASSWORD
cd backend && ./venv/bin/python -m scripts.cleanup_test_users          # dry-run
cd backend && ./venv/bin/python -m scripts.cleanup_test_users --apply  # delete junk
cd backend && ./venv/bin/python -m scripts.compare_aurora_supabase --ids   # Aurora vs Supabase audit
cd backend && ./venv/bin/python -m scripts.migrate_legacy_db_to_supabase --dest api  # copy Aurora rows
```

**Aurora → Supabase cutover:** Data copy is insert-only (`ON CONFLICT DO NOTHING`). All Aurora row IDs should appear on Supabase after migrate; Supabase-only rows are kept. Images stay on Supabase Storage/B2 (URLs in columns). Render must use Supabase `DATABASE_URL` pooler and drop Aurora IAM env vars — see `docs/supabase-consolidation.md`.

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
