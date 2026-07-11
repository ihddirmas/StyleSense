# Deployment Guide — Vercel (frontend) + Render/Railway (FastAPI backend)

> Companion to [CLAUDE.md](../CLAUDE.md) and [README.md](../README.md). Covers taking the local
> dev setup (`localhost:3000` + `localhost:8000`) to a live, shareable URL.

## Architecture recap (why deployment isn't just "push code")

StyleSensei's backend talks to **three** external data services, all of which need real network
access once it's off your laptop:

- **Supabase** — Auth (JWT), Storage buckets, and the social/Realtime tables (`profiles`,
  `friendships`, `messages`). Already reachable from anywhere over HTTPS — no extra config.
- **AWS Aurora PostgreSQL** — core relational tables (`users`, `wardrobe_items`,
  `try_on_results`, `outfits`), connected via `backend/services/db.py`. This is the one that bites
  people: Aurora clusters are **not publicly reachable by default**, and the free-plan cluster
  used here is **IAM-auth only** (no DB password — see `backend/.env.example`).
- **Runway + Anthropic** — plain HTTPS APIs, no special networking needed, just the API keys.

So the backend host (Render or Railway) needs three things Supabase-only setups don't:
`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION`, network access to the Aurora
cluster's port 5432, and enough IAM permission to call `rds:GenerateDBAuthToken`.

---

## Part 0 — Repo/branch topology (two remotes, two Vercel projects)

This repo has two GitHub remotes with different jobs:

- **`upstream` → `github.com/ihddirmas/StyleSense`, branch `feature/ui-on-aurora`** — the live,
  continuously-deployed app. Both Render (backend) and one Vercel project (frontend) track this
  repo/branch. Push here for anything meant to reach real users.
- **`origin` → `github.com/yashthenuia/StyleSense`** — the hackathon-submission fork. A second,
  separate Vercel project tracks this repo (its own branch, e.g. `main`) so the submission link
  stays independent of ongoing live-app work. Not auto-synced from `upstream` — push to it
  explicitly and intentionally, not as a side effect of shipping to live.

Both Vercel projects can point at the **same** Render backend (CORS already allows every
`*.vercel.app` domain via `allow_origin_regex` in `backend/main.py` — see below — so a second
Vercel project needs no backend-side change unless it gets a custom domain).

---

## Part 1 — Frontend on Vercel

The repo already ships [`frontend/vercel.json`](../frontend/vercel.json) with the build command,
security headers, and function config wired up. Set up **two separate Vercel projects** per the
topology above — same steps, different repo/branch and (for the submission project) probably no
custom domain.

1. **Import the repo** in the Vercel dashboard → New Project → point at the target repo
   (`ihddirmas/StyleSense` for the live project, `yashthenuia/StyleSense` for the submission
   project) → pick the branch (`feature/ui-on-aurora` for live) → set **Root Directory** to
   `frontend` (the monorepo has `backend/` alongside it, so Vercel must not build from repo root).
2. **Add environment variables** (Project Settings → Environment Variables — plain dashboard
   values, `vercel.json` no longer declares `@secret` references; an earlier attempt used
   `@stylesense-*` secret refs and broke the build because those secrets were never created via
   `vercel secrets add` — fixed by dropping the `env` block from `vercel.json` entirely):
   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | Your backend's public URL (e.g. `https://styleai-backend.onrender.com`) |
   | `NEXT_PUBLIC_SUPABASE_URL` | Same as `backend/.env`'s `SUPABASE_URL` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key (not the service role key) |
   | `RUNWAYML_API_SECRET` | Same Runway key used by the backend (used by the Next.js API route that mints realtime avatar sessions) |
   | `NEXT_PUBLIC_SITE_URL` | This Vercel project's own production URL — drives `metadataBase` so Open Graph images/canonical links resolve correctly instead of localhost. **Set separately per project** (the live and submission projects have different URLs). |
   | `NEXT_PUBLIC_DEMO_USER_ID` | Optional — demo account UUID if you keep one |
   | `NEXT_PUBLIC_STYLIST_CHARACTER_ID` / `NEXT_PUBLIC_STYLIST_HERO_VIDEO_URL` | From the one-time admin stylist setup scripts (see CLAUDE.md) |
   | `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` | Optional — leave unset to keep Sentry fully disabled |
3. **Deploy.** Vercel builds `frontend/` with `npm run build` and gives you a
   `*.vercel.app` URL immediately, plus a unique preview URL per PR/branch. Once connected, every
   push to the tracked branch auto-deploys — no extra CI config needed for this part.
4. **Custom domain (optional):** Project Settings → Domains → add your domain, update DNS per
   Vercel's instructions. If you add one, also update that project's `NEXT_PUBLIC_SITE_URL`.

**Why the backend needs to know about Vercel, not just the other way around:**
`backend/main.py` sets CORS with `allow_origin_regex=r"https://.*\.vercel\.app"`, so every preview
deploy is already allowed. Only your **production** Vercel domain needs to be set explicitly via
the backend's `FRONTEND_URL` env var (used for the primary `allow_origins` entry and anywhere the
backend builds a link back to the frontend).

---

## Part 2 — Backend on Render (uses the existing `render.yaml`)

The repo already has [`backend/render.yaml`](../backend/render.yaml) as a Blueprint. Steps:

1. Render Dashboard → **New → Blueprint** → point at `github.com/ihddirmas/StyleSense`, branch
   `feature/ui-on-aurora` (see Part 0 — this is the live-app repo/branch, not the hackathon-submission
   fork). Render reads `backend/render.yaml` automatically (`rootDir: backend`).
2. Render will ask you to fill in every `sync: false` secret from the blueprint. Paste values from
   `backend/.env`:
   - `RUNWAY_API_KEY`, `ANTHROPIC_API_KEY`
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
   - `RUNWAY_DEFAULT_VOICE_ID`, `STYLIST_CHARACTER_ID`, `STYLIST_HERO_VIDEO_URL`
   - `FRONTEND_URL` — your production Vercel URL (e.g. `https://stylesensei.vercel.app`)
3. **Add the Aurora variables manually** (not in `render.yaml` yet — add them as extra env vars in
   the Render service settings):
   - `AURORA_IAM_AUTH=true`
   - `AURORA_HOST`, `AURORA_PORT` (5432), `AURORA_DB`, `AURORA_USER`
   - `AWS_REGION`
   - `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` — use an IAM user scoped to
     `rds-db:connect` on this one cluster, not root credentials.
4. **Make Aurora reachable from Render.** Render's outbound IPs aren't static on the free plan, so
   the simplest path for a hackathon/demo is:
   - Set the Aurora cluster's VPC security group to allow inbound TCP 5432 from `0.0.0.0/0`
     (fine for a IAM-auth-only, credential-gated demo cluster; tighten before any real prod use), **and**
   - Confirm the cluster has "Publicly accessible" enabled (RDS console → Connectivity).
   - If you need it locked down instead, use Render's static outbound IP add-on (paid) or run the
     backend on an AWS-native host (Elastic Beanstalk/App Runner) in the same VPC.
5. Render auto-deploys on every push to the connected branch (`autoDeploy: true` in
   `render.yaml`) using `pip install -r requirements.txt` then
   `uvicorn main:app --host 0.0.0.0 --port $PORT`, and polls `healthCheckPath: /health`.
6. **Verify:** hit `https://<your-service>.onrender.com/health` → `{"status": "ok"}`, then
   `https://<your-service>.onrender.com/docs` for the live Swagger UI.

---

## Part 3 — Backend on Railway (alternative to Render)

Railway has no repo config file yet, so set it up via the dashboard/CLI:

1. **New Project → Deploy from GitHub repo**, then set the service's **Root Directory** to
   `backend` (Settings → General).
2. Railway auto-detects Python via `requirements.txt`. Add a **Start Command** since there's no
   Procfile: `uvicorn main:app --host 0.0.0.0 --port $PORT`.
3. Pin the Python version: add a `backend/runtime.txt` containing `python-3.12.9` (rembg/onnxruntime
   have no 3.13 wheels, same constraint noted in `render.yaml`), or set `PYTHON_VERSION=3.12.9` as
   a Railway variable if Railway's builder respects it.
4. Add the **same environment variables** as the Render section above (Runway, Anthropic,
   Supabase, Aurora/AWS, `FRONTEND_URL`) under Variables tab — Railway has no blueprint import
   here, so add them one by one or via `railway variables set KEY=value` in the CLI.
5. Railway assigns a `*.up.railway.app` domain automatically (Settings → Networking → Generate
   Domain). Use that as `NEXT_PUBLIC_API_URL` on Vercel.
6. Aurora networking constraints are identical to Part 2 step 4 — Railway's egress IPs are also
   dynamic on standard plans, so the security-group/public-accessibility approach applies the same
   way.
7. Railway redeploys automatically on push by default (no extra config needed, unlike Render's
   explicit `autoDeploy` flag).
8. **Verify:** same `/health` and `/docs` checks as Render.

---

## Part 4 — Post-deploy checklist

- [ ] `backend/tests/test_auth_flow.py` passes against the **deployed** URL (temporarily point
      `NEXT_PUBLIC_API_URL`/a local `.env` at the prod backend and rerun, or curl the endpoints
      directly) — confirms Supabase JWT verification works outside localhost.
- [ ] `scripts/check_aurora.py` run once against prod env vars locally (never store prod AWS
      creds only on your laptop — but a one-time sanity check before going live is worth it) to
      confirm the IAM token flow works from outside your dev machine's IP if you tightened the
      security group.
- [ ] Vercel's `NEXT_PUBLIC_API_URL` matches the live backend URL exactly (no trailing slash).
- [ ] Backend's `FRONTEND_URL` matches the production Vercel domain exactly (this is the one
      non-preview CORS origin — typos here silently break every fetch from prod).
- [ ] Confirm CORS from the browser: open the deployed frontend, open devtools → Network tab, make
      any authenticated request, check there's no CORS error in the console.
- [ ] Rotate any API key that was ever pasted into a screen-share or committed accidentally before
      going live with real users.

## Part 5 — Keeping the Render free-tier backend warm (GitHub Actions)

Render's free plan spins the service down after 15 minutes with no inbound traffic; the next
visitor then eats a ~50s cold start, which is a bad first impression on a portfolio/resume link.
[`.github/workflows/keep-alive.yml`](../.github/workflows/keep-alive.yml) works around this for
free, with no paid Render plan and no third-party uptime service:

- Runs on a `*/10 * * * *` cron (every 10 minutes) plus a manual `workflow_dispatch` trigger, and
  does a plain `curl` GET against the backend's `/health` endpoint.
- Fails the job (non-zero exit) if the response isn't a 2xx, so a dead backend shows up as a red
  X in the repo's Actions tab.
- Reads the target URL from the repo variable `${{ vars.BACKEND_HEALTH_URL }}`, falling back to
  `https://styleai-backend.onrender.com/health` (the URL implied by `backend/render.yaml`'s
  service name) if the variable isn't set.

**To set/override the URL:** repo → Settings → Secrets and variables → Actions → Variables tab →
New repository variable → name `BACKEND_HEALTH_URL`, value `https://<your-service>.onrender.com/health`.
Only needed if the actual deployed URL differs from the fallback above.

**Caveat:** this only prevents *idle-timeout* spin-down. It does not eliminate cold starts caused
by Render's own maintenance restarts or the fresh deploy that happens after every push
(`autoDeploy: true`) — those still pay the first-request cold-start cost regardless of this
workflow.

## Known gaps (don't claim these are solved elsewhere)

- No Dockerfile or containerized build exists in this repo — both Render and Railway builds run
  directly on their Python buildpacks, not a container you maintain.
- No CI test pipeline (e.g. a GitHub Actions job running `backend/tests/`) runs before deploy —
  `autoDeploy`/Railway's push deploy only rebuilds and restarts, it does not run tests. Run smoke
  tests manually before and after each deploy until a CI step is added. (The only GitHub Actions
  workflow in this repo so far is the keep-alive ping in Part 5 above — it does not run tests.)
