# CLAUDE.md — Project context for AI assistants

> Always-loaded context for any Claude session in this repo.
> For the full spec, see [StyleAI_Master_Roadmap.md](StyleAI_Master_Roadmap.md).

## What this is

**StyleAI (StyleSense)** — AI-powered personal wardrobe + try-on web app. Originally built for the Runway Hackathon (May 2026); now primarily targeting the **YouCam Hackathon** (deadline 2026-08-17). Working demo, not a deployed product.

**The wow moment:** upload a selfie → add clothes from Amazon URLs → see yourself wearing them via Runway gen4_image → place yourself in a "beach wedding" scene → animate as a 5-second video → get outfit and shopping advice from Aria, an AI stylist that knows your wardrobe (text chat; the earlier voice-avatar version was removed as unreachable/unused — see the Personal AI Stylist pivot below).

**Product direction (2026-08-07 pivot):** Aria is repositioned as a Personal AI Stylist — democratizing Kibbe body-type + seasonal color-palette analysis (the kind of thing human stylists charge for), applied first to items the user already owns (before/after, no purchase needed), secondarily to shopping recommendations ("would this suit you" verdicts grounded in styling science, not trend-chasing).

## Tech stack

- **Backend**: Python 3.12 + FastAPI in `backend/venv`. Auth via Supabase JWT (verified server-side).
- **Frontend**: Next.js 14 App Router + TypeScript + Tailwind + framer-motion + Zustand
- **Auth**: Supabase Auth (email/password; Google OAuth wired but not enabled)
- **DB + Storage + Realtime**: Supabase
- **AI**: Runway API (gen4_image, gen4.5 video, characters) + Anthropic Claude (claude-haiku-4-5 for stylist chat)
- **Garment cleanup**: Runway gen4_image_turbo re-synthesis (primary) + rembg local segmentation (fallback)

## File layout

```
runway_hackthon/
├── CLAUDE.md                      # this file
├── StyleAI_Master_Roadmap.md      # full spec
├── backend/
│   ├── main.py                    # FastAPI entry point
│   ├── .env                       # secrets (RUNWAY_API_KEY, SUPABASE_*, ANTHROPIC_API_KEY)
│   ├── requirements.txt
│   ├── supabase_schema.sql                # v1 schema (run first)
│   ├── supabase_schema_v2_social.sql      # v2 (auth + social tables)
│   ├── supabase_schema_v2b_fix.sql        # hotfix for trigger
│   ├── supabase_schema_v2c_fix.sql        # follow-up trigger fix
│   ├── supabase_schema_v2d_selfies.sql    # selfie_urls JSONB array
│   ├── supabase_schema_v2e_stylized.sql   # stylized_avatar_url + status
│   ├── supabase_schema_v2f_stylized_video.sql  # stylized_avatar_video_url + status
│   ├── routers/                   # FastAPI route handlers (all auth-protected)
│   │   ├── avatar.py              # selfie upload, stylized avatar, Aria's shared hero asset
│   │   ├── tryon.py               # generate, generate-multi, event-scene, animate
│   │   ├── wardrobe.py            # CRUD + scrape-and-rehost (with cleaner)
│   │   ├── outfits.py             # save/list outfits
│   │   ├── scrape.py              # URL → product image extractor
│   │   ├── stylist.py             # Anthropic chat + auto suggestions
│   │   ├── friends.py             # search, request, accept, list
│   │   └── chat.py                # threads, messages, share outfit/tryon
│   ├── services/
│   │   ├── runway_service.py            # all Runway SDK calls (try-on, event, animate)
│   │   ├── supabase_service.py          # DB + Storage helpers (uses service role)
│   │   ├── anthropic_service.py         # claude-haiku-4-5 stylist chat
│   │   ├── character_service.py         # POST /v1/avatars — one-time Aria portrait provisioning only
│   │   ├── garment_cleaner.py           # Runway-first, rembg fallback + per-item isolation
│   │   ├── avatar_pose_service.py       # editorial 3D full-body avatar generation
│   │   ├── wardrobe_vision_service.py   # Claude vision multi-item detection
│   │   ├── image_service.py             # PIL validation
│   │   └── auth_service.py              # JWT verification dependency
│   ├── models/schemas.py          # Pydantic request/response models
│   └── tests/                     # smoke tests (run with python -m tests.<name>)
│       ├── test_runway_smoke.py        # cheapest sanity check (~2cr)
│       ├── test_runway_full.py         # cleaner + tryon + event + animate
│       ├── test_supabase_smoke.py
│       ├── test_anthropic_smoke.py
│       ├── test_wardrobe_flow.py       # scrape + rehost + insert end-to-end
│       ├── test_garment_cleaner.py     # before/after comparison
│       ├── test_cleaner_compare.py     # 3 images x 3 rembg models
│       ├── test_auth_flow.py           # signup -> trigger -> signin -> JWT -> protected
│       └── setup_buckets.py            # one-time storage bucket creation
└── frontend/
    ├── .env.local                 # NEXT_PUBLIC_SUPABASE_URL/ANON_KEY
    ├── middleware.ts              # Supabase session refresh + auth redirects
    ├── app/
    │   ├── layout.tsx             # AuthProvider + Sidebar + Topbar
    │   ├── page.tsx               # Dashboard
    │   ├── login/page.tsx         # Email + password + Google button
    │   ├── signup/page.tsx
    │   ├── auth/callback/route.ts # OAuth code exchange
    │   ├── onboarding/page.tsx    # Selfie gallery + profile analysis
    │   ├── wardrobe/page.tsx      # Grid + add modal (upload OR URL)
    │   ├── studio/page.tsx        # Item picker + canvas + event/animate controls
    │   ├── outfits/page.tsx       # Saved outfits + share button
    │   ├── stylist/page.tsx       # Chat with Aria
    │   ├── friends/page.tsx       # Search + request + accept
    │   └── chat/page.tsx          # Thread list + chat thread + share tray (Realtime)
    ├── components/
    │   ├── AuthProvider.tsx       # useAuth() context
    │   ├── ShareToFriendModal.tsx
    │   ├── layout/{Sidebar,Topbar}.tsx
    │   ├── ui/{PageHeader,Toast}.tsx
    │   └── studio/GeneratingState.tsx  # animated loader during Runway calls
    ├── lib/
    │   ├── api.ts                 # fetch wrapper that injects JWT from Supabase session
    │   └── supabase/{client,server}.ts
    ├── store/app.ts               # zustand: selectedItemIds, cached avatar URLs
    └── types/index.ts             # WardrobeItem, TryOnResult, Outfit, ChatMessage
```

## Conventions

- **Always use the backend venv.** Never run global `python` or `pip` for project commands. Either `.\venv\Scripts\python.exe ...` or activate first.
- **All Runway API calls go through `services/runway_service.py`.** Never call the SDK from a route directly. Use `wait_for_task_output(timeout=...)` — don't roll your own polling.
- **All image URLs sent to Runway must be public HTTPS.** Localhost URLs always fail. Re-host via `supabase_service.upload_to_storage()` first.
- **`reference_images` tags are free-form strings.** Use `@tag` in the prompt_text. Up to 3 refs per request.
- **Backend routes derive user_id from `Depends(current_user)` — never trust user_id in request bodies.** RLS bypassed via service role; auth is enforced in the API layer.
- **Cleaner default is `clean='runway'`** for direct uploads, `'none'` for URL-scraped items (retailer photos already clean).
- **Keep emojis out of code/files.** UI uses lucide-react icons + Cormorant Garamond display font.
- **Don't add comments unless the WHY is non-obvious.**

## Agent skills

### Issue tracker

GitHub Issues on `ihddirmas/StyleSense` (the `origin` remote), via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### MCP servers (`.mcp.json`)

- **`playwright`** — already active, no setup. Used throughout `frontend/e2e/` and for live manual verification.
- **`context7`** — library/API docs lookup (Runway, Supabase, Next.js, etc.) before implementing against an unfamiliar API surface. Works without a key (rate-limited); set `CONTEXT7_API_KEY` for higher limits.
- **`supabase`** — direct DB access (schema, migrations, logs) scoped to this project (`--project-ref=zlgzpgqqodfrwnlephrc`), defaults to `--read-only`. Requires `SUPABASE_ACCESS_TOKEN` (Supabase Dashboard → Account → Access Tokens) set as a local env var — never commit a real token. Drop `--read-only` locally (don't commit that change) when you actually need to apply a migration instead of just inspecting schema/logs.

## Common tasks

```powershell
# Run a backend smoke test
Set-Location backend
.\venv\Scripts\python.exe -m tests.test_runway_smoke
.\venv\Scripts\python.exe -m tests.test_runway_full        # set $env:SKIP_ANIMATE="1" to save 60cr
.\venv\Scripts\python.exe -m tests.test_auth_flow
.\venv\Scripts\python.exe -m tests.probe_detect_items      # Claude vision multi-item detection (~$0.01)

# Add a new dependency
.\venv\Scripts\python.exe -m pip install <pkg>
# (then update requirements.txt manually)

# Apply schema changes to Supabase
# Open Supabase Dashboard → SQL Editor → paste the new .sql file → Run
```

**Multi-item wardrobe add flow** — `POST /api/wardrobe/detect-items` (Claude vision, ~$0.01) returns `{image_url, detected: [...]}`. Frontend silently falls through to the existing single-item `/upload` when N=1, or renders a review checklist when N≥2. On confirm, `POST /api/wardrobe/add-multi` runs `runway_isolate_item` per item in parallel (~2cr each, ~6–10cr per multi-add) then inserts each as a wardrobe row tagged `multi-item-detected`. Partial success is allowed — failures come back in `{failed: [...]}` and the wardrobe stays consistent.

## Important constraints

- **Runway credit budget**: 50,000 total. gen4_image_turbo = 2cr, gen4_image = 5cr, gen4.5 video = 60cr per 5s. Use turbo during dev, switch to full quality only for demo recording.
- **Email confirmation must be OFF in Supabase** (Auth → Providers → Email → "Confirm email" OFF) or signup hits a 4/hour rate limit.
- **The handle_new_user() trigger** auto-creates a `profiles` row + a legacy `users` row when an `auth.users` row is inserted. If signup fails with "database error", run `supabase_schema_v2b_fix.sql`.
- **Google OAuth is not enabled** in the Supabase dashboard. Sign-in via email/password only unless you set up the Google Cloud OAuth client.
- **Aria has no voice/video avatar session anymore.** The Runway custom-character voice widget (`AvatarWidget.tsx`, `POST /api/avatar/connect`, per-user `create-character`/`sync-stylist-kb` routes) was removed 2026-08-07 — it was never mounted on any page and was unreachable by users. `character_service.py` now only backs the one-time `setup_admin_stylist` script that provisions Aria's static portrait (see below). All user-facing Aria interaction is the text chat (`stylist/page.tsx` → `POST /api/stylist/chat` → `aria_graph.run_aria`).
- **Each user gets a stylized full-body editorial-3D avatar** auto-generated from their primary selfie (`avatar_pose_service.generate_stylized_avatar`). Stored on `users.stylized_avatar_url`. Used as the Studio idle hero + the "before" in the compare slider. Photoreal try-ons still use the raw selfie for face accuracy. Requires `supabase_schema_v2e_stylized.sql` to be applied.
- **Each user also gets a 5s ramp-walking video** chained off the still (`avatar_pose_service.generate_stylized_video`). Auto-fires after the still is ready. Stored on `users.stylized_avatar_video_url`. Shown as the Dashboard hero. ~60-100cr per primary-selfie change (gen4.5/veo3.1). Requires `supabase_schema_v2f_stylized_video.sql`.
- **Aria has her own ramp video** (`STYLIST_HERO_VIDEO_URL` env var, read server-side by `GET /api/avatar/stylist`). Shown on the dashboard when the user has no selfie OR while their per-user video is still generating. Generated once via `python -m scripts.animate_admin_stylist`.
- **rembg is NOT a substitute for Runway** for occluded photos (person wearing clothes). It only cuts out what's visible.

## Admin stylist setup (one-time)

```powershell
cd backend
.\venv\Scripts\python.exe -m scripts.setup_admin_stylist
# Prints: STYLIST_CHARACTER_ID=<uuid>
# Paste that UUID into BOTH backend/.env and frontend/.env.local, then restart both servers.
```

The script generates a stylized 3D female stylist via `gen4_image`, uploads to Supabase, creates a Runway custom avatar with `RUNWAY_DEFAULT_VOICE_ID`, and waits for status `READY`. ~5 credits + ~30 sec. Re-run with `$env:FORCE="1"` to recreate. Note: this only provisions the static portrait/asset used by `GET /api/avatar/stylist` for the dashboard hero fallback — there is no live voice session backed by this character anymore.

## Aria ramp-walking hero video (one-time)

```powershell
cd backend
.\venv\Scripts\python.exe -m scripts.animate_admin_stylist
# Prints: STYLIST_HERO_VIDEO_URL=<supabase public mp4>
# Paste into BOTH backend/.env and frontend/.env.local, restart both servers.
```

Fetches Aria's portrait, animates with the shared `RAMP_WALK_PROMPT` at landscape 16:9 (`ratio="1280:720"`), rehosts the MP4 to Supabase. ~60-100 credits, ~60s. Re-run with `$env:FORCE="1"` (e.g. if you change the prompt or aspect ratio).

**Existing users without a ramp video**: the auto-chain (`_bg_generate_stylized`) only fires from selfie upload / set-primary. Anyone who uploaded before the chain was wired sees a "Generate my ramp video" button on the dashboard hero — one click posts to `POST /api/avatar/regenerate-stylized`, which is idempotent against the cached still and only spends video credits (~60-100cr).

## Known not-yet-tested

- Animate endpoint (gen4.5 image-to-video, ~60cr per 5s)
- The full social loop (sign up two users → friend → chat → share outfit) — built but not user-verified end-to-end

## How to debug

- Backend logs: stderr of the uvicorn process
- Frontend logs: terminal running `npm run dev`, plus browser devtools console + network tab
- Auth issues: run `tests/test_auth_flow.py` — full signup → signin → JWT → protected route check
- Runway issues: run `tests/test_runway_smoke.py` to confirm credits + auth, then `test_runway_full.py` for individual endpoints
- Supabase RLS issues: service role bypasses RLS; if a backend route fails, check whether you're using the service role client (`supabase_service.supabase`) vs the user JWT client.

## Reference URLs

- Runway docs: https://docs.dev.runwayml.com
- Anthropic SDK: claude-haiku-4-5-20251001 (default for chat)
- Supabase project URL is set via `SUPABASE_URL` in `backend/.env`
