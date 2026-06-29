# StyleAI Deployment Guide

Free-tier deploy that scales by flipping dashboard toggles — no re-architecting.

## Stack

| Layer | Service | Free tier |
|---|---|---|
| Frontend (Next.js) | Vercel | unlimited hobby, 100GB bw/mo |
| Backend (FastAPI) | Render | 750 hrs/mo, 512MB RAM |
| DB + Auth + Storage | Supabase | 500MB DB, 1GB storage, 50k MAU |
| AI | Runway + Anthropic | pay-per-use (only real cost) |

**Fixed cost at Phase 0: $0/mo.** You only pay Runway/Anthropic per generation.

---

## Prerequisites

- [ ] Code pushed to GitHub (already at `github.com/ihddirmas/StyleSense`)
- [ ] Supabase project live and **not paused** (see "Keep Supabase awake" below)
- [ ] Your secrets handy (everything in `backend/.env` and `frontend/.env.local`)

---

## Step 1 — Supabase (already set up; just verify)

1. Dashboard -> your project is **Active** (not paused).
2. Auth -> Providers -> Email -> **"Confirm email" OFF** (avoids the signup rate limit).
3. Storage -> confirm `wardrobe`, `selfies`, `tryons` buckets exist and are **public**.
4. The schema SQL files in `backend/` are already applied — nothing to re-run unless you recreate the project.

---

## Step 2 — Backend on Render

1. [render.com](https://render.com) -> New -> **Blueprint** -> connect the GitHub repo.
2. Render reads [backend/render.yaml](backend/render.yaml) and proposes the `styleai-backend` web service.
3. When prompted, paste each secret (these are `sync: false` so they live only in Render, never in git). Copy values from `backend/.env`:
   - `RUNWAY_API_KEY`
   - `ANTHROPIC_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_ANON_KEY`
   - `RUNWAY_DEFAULT_VOICE_ID`
   - `STYLIST_CHARACTER_ID`
   - `STYLIST_HERO_VIDEO_URL`
   - `FRONTEND_URL` -> leave blank for now; set it in Step 4.
4. Deploy. When live you'll get a URL like `https://styleai-backend.onrender.com`.
5. Verify: open `https://styleai-backend.onrender.com/health` -> should return `{"status":"ok"}`.

> **Cold starts:** free tier sleeps after 15 min idle; the first request then takes ~30-50s. Fine for demos. Phase 1 (Render Starter, $7/mo) makes it always-on.

---

## Step 3 — Frontend on Vercel

1. [vercel.com](https://vercel.com) -> Add New -> Project -> import the repo.
2. **Root Directory: `frontend`** (important — the repo has backend + frontend).
3. Framework preset: Next.js (auto-detected). Leave build settings default.
4. Add Environment Variables (from `frontend/.env.local`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `RUNWAYML_API_SECRET`  (server-only; used by the avatar connect route)
   - `STYLIST_CHARACTER_ID`
   - `STYLIST_HERO_VIDEO_URL`
   - `NEXT_PUBLIC_API_URL` -> your Render URL from Step 2 (e.g. `https://styleai-backend.onrender.com`)
5. Deploy. You'll get a URL like `https://styleai.vercel.app`.

---

## Step 4 — Wire them together

1. Back in **Render** -> styleai-backend -> Environment -> set
   `FRONTEND_URL = https://styleai.vercel.app` (your Vercel URL). This drives CORS
   in [backend/main.py](backend/main.py) — it's already coded to read this env var.
2. Save -> Render redeploys automatically.
3. In **Supabase** -> Auth -> URL Configuration -> add your Vercel URL to
   **Site URL** and **Redirect URLs** (so email/OAuth callbacks resolve).

---

## Step 5 — Smoke test the live app

- [ ] Open the Vercel URL -> redirects to `/login`
- [ ] Sign up a new account -> lands on dashboard (no "failed to fetch")
- [ ] Upload a selfie, add a wardrobe item
- [ ] Generate a try-on -> image appears AND persists on refresh (the `_rehost` fix)
- [ ] Ask the stylist a question -> get a reply

---

## Keep Supabase awake (free tier)

Free projects pause after ~7 days idle, which breaks everything (DNS stops
resolving). Two options:

- **Free:** add a Vercel Cron that pings the backend daily. Create
  `frontend/vercel.json`:
  ```json
  { "crons": [ { "path": "/api/ping", "schedule": "0 6 * * *" } ] }
  ```
  and a tiny `frontend/app/api/ping/route.ts` that fetches
  `${NEXT_PUBLIC_API_URL}/health` (which touches Supabase). Keeps both awake.
- **Paid:** Supabase Pro ($25/mo) never pauses.

---

## Scaling path (one toggle each)

| Phase | Trigger | Change | Cost |
|---|---|---|---|
| 0 — Free | demo / first users | this guide | $0 + AI |
| 1 — No cold starts | users hit the wait | Render Starter, always-on | $7/mo |
| 2 — Stable data | DB near 500MB / pausing hurts | Supabase Pro | +$25/mo |
| 3 — Growth | sustained traffic | Vercel Pro + Render scaling | ~$50-100/mo |
| 4 — Scale | heavy load | multi-instance backend, CDN, queue Runway jobs | usage-based |

Same code at every phase — upgrades are dashboard switches.

---

## Security notes

- `RUNWAY_API_KEY` / `ANTHROPIC_API_KEY` / `SUPABASE_SERVICE_ROLE_KEY` live **only**
  on Render (backend). Never expose them to the browser.
- `RUNWAYML_API_SECRET` on Vercel is used **server-side** in the Next API route only.
- Backend derives `user_id` from the JWT (`Depends(current_user)`), never from request
  bodies — keep it that way.
