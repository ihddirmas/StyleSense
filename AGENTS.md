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

Supabase (auth + storage + social), AWS Aurora (core tables), Runway, and Anthropic are all cloud-hosted. No Docker Compose in repo. Deployed backend reference: `https://styleai-backend.onrender.com/health` (may differ from local FastAPI response shape).

### Gotchas

- Supabase **email confirmation must be OFF** or signup hits rate limits (`CLAUDE.md`).
- Runway image URLs must be public HTTPS — localhost fails; use Supabase Storage.
- `posthog-node` warns on Node 22.14; dev still works.
- Python commands in docs use Windows paths; on Linux use `backend/venv/bin/python`.
