# 👗 StyleAI — Master Project Roadmap
### Runway API Hackathon · May 8–11, 2026
### Stack: Python (FastAPI) Backend + Next.js (React) Frontend · Local Demo Build

---

> **HOW TO USE THIS FILE WITH CLAUDE CODE**
> Paste this entire document at the start of your Claude Code session and say:
> *"This is our full project spec. Let's start with [Day 1 Task 1]. Read all rules, constraints and API docs carefully before writing any code."*
> Claude Code should reference this document for every decision — architecture, API calls, UI, file structure, naming.
> See also: [CLAUDE.md](CLAUDE.md) for the always-loaded session context.

---

## 📊 Current Status (last updated 2026-05-09 / Day 2 of 3)

### ✅ Built and verified working

**Backend (FastAPI in venv)**
- All routes mounted: avatar, tryon, wardrobe, outfits, scrape, stylist, **friends, chat**
- Supabase JWT auth dependency on every route (`Depends(current_user)`)
- Runway service: try-on (`gen4_image_turbo`), event scene (`gen4_image`), animate (`gen4.5`), garment cleaner via re-synthesis
- Anthropic stylist (`claude-haiku-4-5`) — recommends specific items by ID
- Garment cleaner pipeline: Runway re-synth (default) + rembg fallback (built but rembg is unreliable for occluded photos)
- URL scraper with multi-site fallback and Anthropic-suggested category
- Custom character creation via direct REST (`POST /v1/avatars` + `/v1/documents`) with manual-portal fallback
- 9 smoke tests under `backend/tests/` — runway, supabase, anthropic, wardrobe, cleaner, auth

**Frontend (Next.js 14 + Tailwind + framer-motion)**
- Luxury dark + gold design system (Cormorant Garamond display, DM Sans body)
- Pages: dashboard, wardrobe, studio, outfits, stylist, friends, chat, onboarding, login, signup
- Supabase Auth: email/password + Google OAuth UI (Google not yet enabled in dashboard)
- Auth middleware redirects unauthed traffic; AuthProvider context exposes user + profile across the app
- Realtime sidebar badges (pending friend requests, unread chat count)
- Studio: item picker, generating-state animation, before/after slider, event presets, share-to-friend modal
- Chat: thread list + DM with Supabase Realtime live updates + share-tray for outfits/try-ons
- Friends: search by email/share-code, send/accept/decline requests, share-code copy

**Supabase**
- v1 schema: `users`, `wardrobe_items`, `try_on_results`, `outfits` + 3 storage buckets
- v2 schema: `profiles`, `friendships`, `messages` + tightened RLS policies + auto-create trigger
- v2b fix: bulletproof `handle_new_user()` trigger; orphan row cleanup
- Realtime publications enabled on `messages` + `friendships`
- Email confirmation: **OFF** (so signups don't hit the 4/hour email rate limit)

**Verified end-to-end (with Runway credits ✅)**
- Runway smoke (gen4_image_turbo with reference image)
- Runway garment cleaner (re-synthesis on a "person wearing it" photo)
- Runway try-on (selfie + garment → person wearing it)
- Runway event scene (try-on + context → editorial editorial in scene)
- Anthropic stylist chat returning items by ID
- Supabase upload → public URL → Pillow validation → wardrobe insert
- Auth flow: signup → trigger → profile + users rows → signin → JWT → protected backend call

### ⏳ Built but not yet user-tested

These are coded and the smoke tests confirm the underlying APIs work, but the full UI flow hasn't been walked through end-to-end:

- Sign up + sign in via the browser UI (verified programmatically only)
- Avatar character creation programmatic path (`POST /v1/avatars`) — may fall back to manual portal
- Knowledge base attachment (`POST /v1/documents` + PATCH avatar)
- Friends search → request → accept → list (UI built, not user-clicked)
- Chat send + Realtime delivery between two browser windows
- Share-outfit / share-tryon → appears as a card in the recipient's chat
- AI Stylist chat parsing `[ITEM:id]` mentions → clickable cards that navigate to Studio

### ❌ Not yet tested (would burn credits)

- **Animate endpoint** (`gen4.5` image-to-video): 60 credits per 5-second clip. Wired into Studio but never called.
- **Runway WebRTC realtime avatar session**: `app/api/avatar/connect/route.ts` mints the session token; `AvatarWidget` shows a "session ready" stub. Embedding the actual `<AvatarCall>` component from `@runwayml/avatars-react` is one more step (SDK API surface needs verification).

### 🚫 Out of scope (for the hackathon)

- Production auth / SSO providers beyond Google
- Real CI/CD or deployment
- Multi-tenant isolation hardening
- Mobile native apps
- Payment / subscription
- Real-time multi-user editing of an outfit

### 🌟 Improvements we could add if there's time

In rough priority order:
1. **Multi-item try-on UI polish** — backend supports 2 items; UI lets you select 2 but flow could be smoother (selection persistence, item swap)
2. **Smart outfit suggestions** in Studio — `/api/stylist/suggestions` already returns 3 outfit picks; show them as cards on Studio open
3. **"Re-clean" button** on wardrobe items — re-process a saved item through the cleaner
4. **Share card generator** — turn a try-on result into a downloadable branded card (HTML Canvas)
5. **Outfit history timeline** on Dashboard — show recent try-ons with timestamps
6. **Voice avatar speaking during generation** — pre-record/TTS a "putting your look together…" line during the 20-30s wait
7. **Knowledge sync auto-trigger** — re-upload wardrobe.txt to the avatar's KB whenever a wardrobe item is added/removed
8. **Frontend toast on cleaner method** — show "cleaned via Runway" / "kept original" so user understands what happened
9. **Mobile responsive pass** — current layout is desktop-first; demo on phone if a judge asks

### 🔥 Known limitations / gotchas

| Issue | Workaround |
|---|---|
| rembg can't fix photos where the garment is occluded by hands/body | Use Runway re-synthesis (current default) or skip cleaning entirely |
| Some retailers (Amazon, H&M) block scraping | UI shows fallback to paste image URL directly into "Product URL" field |
| Email rate limit 4/hour if email confirmation is ON | We disabled email confirmation |
| Google OAuth shows "provider not enabled" until configured in Supabase dashboard | Email signup works; Google requires Google Cloud OAuth client + Supabase config |
| Runway custom character creation may not be GA | Backend returns 501 with manual portal instructions; user pastes UUID via fallback form |
| Runway requires public HTTPS image URLs (not localhost) | Always re-host via Supabase Storage first |

### 📋 Test commands

```powershell
Set-Location c:\Users\yasht.ASUS\OneDrive\Desktop\hackthon\runway_hackthon\backend
.\venv\Scripts\python.exe -m tests.test_runway_smoke         # ~2 credits
.\venv\Scripts\python.exe -m tests.test_runway_full          # ~70 credits (set $env:SKIP_ANIMATE="1" for ~10cr)
.\venv\Scripts\python.exe -m tests.test_auth_flow            # auth end-to-end
.\venv\Scripts\python.exe -m tests.test_wardrobe_flow        # scrape + rehost + insert
.\venv\Scripts\python.exe -m tests.test_garment_cleaner      # before/after URLs to compare
.\venv\Scripts\python.exe -m tests.test_supabase_smoke
.\venv\Scripts\python.exe -m tests.test_anthropic_smoke
```

### 🎬 Demo testing checklist (do this before recording)

**Single user happy path:**
- [ ] Sign up at `/signup` (or sign in)
- [ ] Onboarding: upload selfie, click "Create character" (note any fallback)
- [ ] Wardrobe: add item via Upload Photo (test the cleaner)
- [ ] Wardrobe: add item via Product URL (Uniqlo or ASOS)
- [ ] Studio: select 1 item → Generate try-on → wait 20s → result reveals
- [ ] Studio: drag the before/after slider
- [ ] Studio: click an event preset → see yourself in the scene
- [ ] Studio: click Animate (~60cr) → 5s video plays
- [ ] Studio: Save outfit
- [ ] Stylist: ask "what should I wear to a dinner date?" → see specific item picks

**Two-user social path** (open second browser/incognito):
- [ ] Sign up second account
- [ ] Friends: copy share code from User A, search in User B → Add
- [ ] Friends: User A accepts the request
- [ ] Chat: send messages back and forth → confirm Realtime delivery
- [ ] Outfits: User A hovers an outfit → click share icon → pick User B → outfit card appears in chat
- [ ] User B clicks the outfit card → opens in Studio

---

## Table of Contents

1. [Project Vision & Winning Strategy](#1-project-vision--winning-strategy)
2. [Architecture Overview](#2-architecture-overview)
3. [Complete Tech Stack](#3-complete-tech-stack)
4. [Project Folder Structure](#4-project-folder-structure)
5. [Environment Setup](#5-environment-setup)
6. [Database Schema (Supabase)](#6-database-schema-supabase)
7. [Runway API — Critical Rules & Constraints](#7-runway-api--critical-rules--constraints)
8. [Backend: FastAPI Python — All Routes](#8-backend-fastapi-python--all-routes)
9. [Frontend: Next.js — All Pages & Components](#9-frontend-nextjs--all-pages--components)
10. [UI Design System — Win With Visuals](#10-ui-design-system--win-with-visuals)
11. [Wow Factor Add-ons](#11-wow-factor-add-ons)
12. [3-Day Build Schedule](#12-3-day-build-schedule)
13. [Credit Budget Strategy](#13-credit-budget-strategy)
14. [Demo Script (Record This)](#14-demo-script-record-this)
15. [Common Errors & Fixes](#15-common-errors--fixes)

---

## 1. Project Vision & Winning Strategy

### What We're Building
**StyleAI** — an AI-powered personal wardrobe app where:
- Your avatar literally looks like YOU (Runway Custom Characters)
- You can try any outfit on your avatar instantly (Runway gen4_image)
- Your avatar talks to you about fashion, knows your wardrobe (Runway gwm1_avatars + Tool Calling)
- You can see yourself at any event in any outfit (Runway gen4.5 image-to-video)
- Your wardrobe is saved so you never upload the same item twice (Supabase)

### Why This Wins
The judges score: **Creativity · Technical Depth · Impact · Polish**

| Criterion | Our Edge |
|-----------|---------|
| Creativity | Avatar that IS you + wardrobe memory + conversational stylist — nobody else will do all three |
| Technical Depth | Uses Characters API + Tool Calling + Knowledge Base + gen4_image + gen4.5 + gen4_aleph — maximum API coverage |
| Impact | Solves real $$$  problem (online shopping returns cost $816B/year globally) |
| Polish | Luxury dark UI, smooth animations, zero rough edges in the demo path |

### The Demo Moment That Wins
> User uploads selfie → avatar is created → pastes Amazon link → outfit appears on avatar → says "show me at a beach wedding" → animated video plays → avatar says "I love this on you, want to try the matching shoes?" 

That sequence = first place.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    USER'S BROWSER                       │
│                                                         │
│   Next.js 14 Frontend  (localhost:3000)                 │
│   ┌─────────────────────────────────────────────┐       │
│   │  Pages: Dashboard, Wardrobe, Studio,        │       │
│   │         Stylist, Outfits, Onboarding        │       │
│   │                                             │       │
│   │  Runway React SDK (@runwayml/avatars-react) │       │
│   │  → Direct WebRTC connection to Runway       │       │
│   │    for real-time avatar video call          │       │
│   └──────────────┬──────────────────────────────┘       │
└──────────────────┼──────────────────────────────────────┘
                   │ HTTP (fetch/axios)
                   │
┌──────────────────▼──────────────────────────────────────┐
│           FastAPI Backend  (localhost:8000)              │
│                                                         │
│   /api/avatar/*     → Runway Characters API             │
│   /api/tryon/*      → Runway gen4_image + gen4.5        │
│   /api/wardrobe/*   → Supabase DB + Storage             │
│   /api/outfits/*    → Supabase DB                       │
│   /api/scrape/*     → URL scraping (BeautifulSoup)      │
│   /api/stylist/*    → Tool handler for avatar           │
└──────────────────┬──────────────────────────────────────┘
                   │
         ┌─────────┼─────────┐
         │                   │
┌────────▼──────┐   ┌────────▼──────────┐
│  Runway API   │   │   Supabase Cloud   │
│  (external)   │   │   (free tier)      │
│               │   │                   │
│ Characters    │   │  PostgreSQL DB     │
│ gen4_image    │   │  Storage bucket    │
│ gen4.5        │   │  Auth              │
│ gen4_aleph    │   └───────────────────┘
└───────────────┘
```

**Key rule:** The frontend NEVER calls the Runway API directly (except the Characters WebRTC widget). ALL Runway API calls go through FastAPI. This keeps the API key safe and lets you add logic (retries, credit checks, error handling) in one place.

---

## 3. Complete Tech Stack

### Backend (Python)
```
Python 3.11+
FastAPI 0.111+          — async web framework
uvicorn                 — ASGI server
runwayml                — Official Runway Python SDK (pip install runwayml)
supabase                — Supabase Python client
python-multipart        — File uploads
httpx                   — Async HTTP (for URL scraping)
beautifulsoup4          — HTML parsing for product URLs
Pillow                  — Image processing/validation
python-dotenv           — .env loading
pydantic                — Request/response models (built into FastAPI)
```

### Frontend (JavaScript/TypeScript)
```
Next.js 14 (App Router)
TypeScript
Tailwind CSS
@runwayml/avatars-sdk-react   — Official Runway Characters React SDK
@supabase/supabase-js         — Supabase browser client
zustand                       — Lightweight state management
lucide-react                  — Icons
framer-motion                 — Animations (the secret weapon for polish)
```

### Install Commands

**Backend:**
```bash
mkdir styleai-backend && cd styleai-backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install fastapi uvicorn runwayml supabase python-multipart httpx beautifulsoup4 Pillow python-dotenv
```

**Frontend:**
```bash
npx create-next-app@latest styleai-frontend --typescript --tailwind --app --no-src-dir
cd styleai-frontend
npm install @runwayml/avatars-sdk-react @supabase/supabase-js zustand lucide-react framer-motion
```

---

## 4. Project Folder Structure

```
styleai/
├── backend/                          ← FastAPI Python app
│   ├── main.py                       ← FastAPI app entry point, CORS config
│   ├── .env                          ← API keys (never commit this)
│   ├── requirements.txt
│   ├── routers/
│   │   ├── avatar.py                 ← Avatar creation, knowledge base
│   │   ├── tryon.py                  ← Try-on, event scene, animation
│   │   ├── wardrobe.py               ← CRUD for wardrobe items
│   │   ├── outfits.py                ← CRUD for saved outfits
│   │   ├── scrape.py                 ← URL → product image scraper
│   │   └── stylist.py                ← Tool handler endpoint for avatar
│   ├── services/
│   │   ├── runway_service.py         ← All Runway SDK calls live here
│   │   ├── supabase_service.py       ← All Supabase calls live here
│   │   └── image_service.py          ← Image validation, resizing
│   └── models/
│       └── schemas.py                ← Pydantic request/response models
│
└── frontend/                         ← Next.js app
    ├── app/
    │   ├── layout.tsx                ← Root layout, font imports
    │   ├── page.tsx                  ← Dashboard (/)
    │   ├── globals.css               ← Design tokens, global styles
    │   ├── onboarding/page.tsx
    │   ├── wardrobe/page.tsx
    │   ├── studio/page.tsx
    │   ├── stylist/page.tsx
    │   ├── outfits/page.tsx
    │   └── api/
    │       └── avatar/
    │           └── connect/route.ts  ← REQUIRED by Runway React SDK
    ├── components/
    │   ├── layout/
    │   │   ├── Sidebar.tsx
    │   │   ├── Topbar.tsx
    │   │   └── PageWrapper.tsx
    │   ├── ui/
    │   │   ├── Button.tsx
    │   │   ├── Modal.tsx
    │   │   ├── ImageUpload.tsx
    │   │   ├── LoadingSpinner.tsx
    │   │   ├── GeneratingOverlay.tsx  ← Animated loading during Runway tasks
    │   │   └── Toast.tsx
    │   ├── wardrobe/
    │   │   ├── WardrobeGrid.tsx
    │   │   ├── WardrobeCard.tsx
    │   │   ├── AddItemModal.tsx
    │   │   └── FilterBar.tsx
    │   ├── studio/
    │   │   ├── ItemSelector.tsx
    │   │   ├── TryOnCanvas.tsx
    │   │   └── EventControls.tsx
    │   └── stylist/
    │       ├── AvatarWidget.tsx      ← Wraps Runway React SDK
    │       └── SuggestionPills.tsx
    ├── hooks/
    │   ├── useRunwayTask.ts          ← Polls backend for task completion
    │   └── useWardrobe.ts            ← Wardrobe data fetching/mutations
    ├── store/
    │   └── app.ts                    ← Zustand global state
    ├── lib/
    │   ├── api.ts                    ← fetch wrapper pointing to :8000
    │   └── supabase.ts               ← Supabase browser client
    ├── types/
    │   └── index.ts                  ← TypeScript interfaces
    └── .env.local                    ← Frontend env vars
```

---

## 5. Environment Setup

### Backend `.env`
```env
# Runway
RUNWAY_API_KEY=key_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Supabase
SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# App
FRONTEND_URL=http://localhost:3000
```

### Frontend `.env.local`
```env
# Points to FastAPI backend
NEXT_PUBLIC_API_URL=http://localhost:8000

# Supabase (public keys only — safe for browser)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Runway (ONLY for the Characters connect route — keep secret)
RUNWAYML_API_SECRET=key_xxxxxxxxxxxxxxxx...
```

### Start Commands
```bash
# Terminal 1 — Backend
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000

# Terminal 2 — Frontend
cd frontend
npm run dev
# Opens at http://localhost:3000
```

---

## 6. Database Schema (Supabase)

Run this SQL in Supabase → SQL Editor → New Query:

```sql
-- ═══════════════════════════════════════════════
-- USERS
-- ═══════════════════════════════════════════════
CREATE TABLE users (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 TEXT UNIQUE,
  full_name             TEXT,
  -- Runway Characters
  avatar_character_id   TEXT,         -- UUID from Runway Characters API
  avatar_selfie_url     TEXT,         -- Original selfie stored in Supabase Storage
  avatar_voice_id       TEXT,         -- Runway voice ID
  -- Timestamps
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════
-- WARDROBE ITEMS
-- ═══════════════════════════════════════════════
CREATE TABLE wardrobe_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  -- Item info
  name              TEXT NOT NULL,
  category          TEXT NOT NULL CHECK (category IN ('tops','bottoms','dresses','outerwear','shoes','accessories')),
  occasion          TEXT CHECK (occasion IN ('casual','formal','evening','sport','beach','any')),
  color             TEXT,
  brand             TEXT,
  tags              TEXT[] DEFAULT '{}',
  -- Images
  image_url         TEXT NOT NULL,     -- Stored in Supabase Storage
  source_url        TEXT,              -- Original Amazon/product URL
  thumbnail_url     TEXT,              -- Smaller version for grids
  -- Runway optimization
  runway_asset_id   TEXT,              -- Pre-uploaded ephemeral ID (reuse within 24h)
  runway_asset_expires_at TIMESTAMPTZ, -- When to re-upload
  -- Timestamps
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════
-- TRY-ON RESULTS
-- ═══════════════════════════════════════════════
CREATE TABLE try_on_results (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  wardrobe_item_id      UUID REFERENCES wardrobe_items(id) ON DELETE SET NULL,
  -- Results
  result_image_url      TEXT,          -- Generated try-on image
  result_video_url      TEXT,          -- Animated version (gen4.5)
  event_scene_url       TEXT,          -- Event scene version
  -- Context
  event_context         TEXT,          -- "beach wedding, golden hour"
  prompt_used           TEXT,          -- Full prompt sent to Runway
  model_used            TEXT,          -- gen4_image, gen4_image_turbo, etc.
  -- Runway task tracking
  runway_task_id        TEXT,
  runway_video_task_id  TEXT,
  -- Status
  status                TEXT DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
  credits_used          INTEGER,
  -- Timestamps
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════
-- SAVED OUTFITS
-- ═══════════════════════════════════════════════
CREATE TABLE outfits (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  name              TEXT NOT NULL,
  item_ids          UUID[] NOT NULL DEFAULT '{}',   -- Array of wardrobe_item IDs
  occasion          TEXT,
  preview_image_url TEXT,                            -- Best try-on result for this combo
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════
ALTER TABLE users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE wardrobe_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE try_on_results   ENABLE ROW LEVEL SECURITY;
ALTER TABLE outfits          ENABLE ROW LEVEL SECURITY;

-- For hackathon demo: allow all (simplify auth)
-- Replace with proper user-scoped policies for production
CREATE POLICY "allow_all_users"          ON users            FOR ALL USING (true);
CREATE POLICY "allow_all_wardrobe"       ON wardrobe_items   FOR ALL USING (true);
CREATE POLICY "allow_all_tryon"          ON try_on_results   FOR ALL USING (true);
CREATE POLICY "allow_all_outfits"        ON outfits          FOR ALL USING (true);

-- ═══════════════════════════════════════════════
-- SUPABASE STORAGE BUCKETS
-- Run these in Storage → New Bucket
-- ═══════════════════════════════════════════════
-- Bucket name: "wardrobe"    → Public: YES
-- Bucket name: "selfies"     → Public: YES
-- Bucket name: "tryons"      → Public: YES
```

---

## 7. Runway API — Critical Rules & Constraints

> Claude Code MUST follow all of these. Violations cause silent failures or wasted credits.

### SDK Installation & Import
```python
# Install
pip install runwayml

# Import and initialize (Python)
from runwayml import RunwayML, TaskFailedError, TaskTimeoutError

client = RunwayML(api_key=os.getenv("RUNWAY_API_KEY"))
# The SDK auto-reads RUNWAYML_API_SECRET env var if no api_key arg given
```

### Image Input Rules (CRITICAL)
```
ALWAYS use HTTPS URLs — never localhost URLs, never IP addresses
NEVER use redirecting URLs (3XX = task fails silently)
Image must be JPEG, PNG, or WebP — NOT GIF
Content-Type header MUST match: image/jpeg, image/png, or image/webp
Max size via URL: 16MB
Max size via base64 data URI: 5MB (file must be <3.3MB before encoding)
For anything >5MB: use Runway Ephemeral Uploads (runway:// URI)
Recommended: upload to Supabase Storage first → use the public URL
Image aspect ratio for gen4_image: between 0.25:1 and 4:1
Image aspect ratio for gen4.5: between 0.5:1 and 2:1
NEVER pass localhost URLs to Runway — they can't reach your machine!
For demo: upload all test images to Supabase Storage first
```

### Polling Rules (CRITICAL)
```
Poll interval: 5 seconds minimum (not less — you'll get rate limited)
Add jitter: random 0-2 seconds on top of the 5s interval
Default timeout: 10 minutes
Use wait_for_task_output() for simplicity — it handles polling internally
Handle TaskFailedError and TaskTimeoutError separately
Do NOT use fixed-interval polling (setInterval style)
```

### Python SDK — Correct Usage
```python
from runwayml import RunwayML, TaskFailedError, TaskTimeoutError

client = RunwayML(api_key=os.getenv("RUNWAY_API_KEY"))

# ✅ CORRECT — try-on image generation
try:
    task = client.text_to_image.create(
        model="gen4_image",
        prompt_text="Full body fashion photo of person wearing blue linen blazer",
        ratio="768:1024",       # Portrait — good for fashion
        reference_images=[
            {"uri": "https://your-supabase.storage.../selfie.jpg", "tag": "person"},
            {"uri": "https://your-supabase.storage.../blazer.jpg", "tag": "style"},
        ]
    ).wait_for_task_output(timeout=300)  # 5 min timeout
    
    image_url = task.output[0]

except TaskFailedError as e:
    # Task failed — log e.task_details, return 500
    raise HTTPException(status_code=500, detail=f"Runway task failed: {e.task_details}")
except TaskTimeoutError:
    # Took too long — return 504
    raise HTTPException(status_code=504, detail="Generation timed out")

# ✅ CORRECT — animate try-on result (image → video)
try:
    task = client.image_to_video.create(
        model="gen4.5",
        prompt_image="https://your-supabase.storage.../tryon-result.jpg",
        prompt_text="Person slowly walking forward, confident fashion model pose",
        ratio="720:1280",       # Portrait video
        duration=5,              # 5 seconds
    ).wait_for_task_output(timeout=300)
    
    video_url = task.output[0]

except TaskFailedError as e:
    raise HTTPException(status_code=500, detail=str(e.task_details))

# ✅ CORRECT — event scene (overlay outfit on scene)
task = client.text_to_image.create(
    model="gen4_image",
    prompt_text=f"Person at {event_context}, full body visible, photorealistic, fashion editorial",
    ratio="1024:1024",
    reference_images=[
        {"uri": tryon_result_url, "tag": "person"},  # Use the try-on result as reference
    ]
).wait_for_task_output(timeout=300)
```

### Available Models Quick Reference
```
TEXT/IMAGE TO IMAGE:
  gen4_image           → Best quality, slower (~20-40s)
  gen4_image_turbo     → Faster, slightly lower quality (~10-20s)
  gemini_image3_pro    → Alternative, good at following references
  gemini_2.5_flash     → Fastest image gen

IMAGE TO VIDEO:
  gen4.5               → Best quality video (5s = ~40-60s generation)
  gen4_turbo           → Faster video generation
  gen4_aleph           → Video-to-video enhancement/transformation

REAL-TIME AVATAR:
  gwm1_avatars         → Characters API (WebRTC, NOT async tasks)

OUTPUT RATIOS (gen4_image):
  "1360:768"  → Landscape HD
  "768:1024"  → Portrait (best for fashion/people)
  "1024:1024" → Square

OUTPUT RATIOS (gen4.5 video):
  "1280:720"  → Landscape
  "720:1280"  → Portrait (best for fashion videos)
  "960:960"   → Square
```

### Characters API — Key Facts
```
CHARACTER CREATION:
  Done in Runway Dev Portal (dev.runwayml.com) → Characters tab → Create Character
  Upload ONE image (front-facing, good lighting, 16:9 preferred)
  Set instructions (system prompt for the avatar)
  Set starting script (what avatar says when call begins)
  Upload knowledge .txt file (wardrobe data goes here)
  You get a character UUID → store in your DB

IN CODE (React SDK):
  The frontend uses @runwayml/avatars-sdk-react
  It requires a Next.js API route at /api/avatar/connect
  That route calls Runway API with your RUNWAYML_API_SECRET (server-side only)
  The SDK handles WebRTC — you just render <AvatarCall> or <AvatarSession>

TOOL CALLING:
  Two types: Client Tools (browser, one-way) and Server RPC (Node.js only)
  For Python backend: use Client Tools for UI effects, handle wardrobe in avatar instructions
  The avatar reads wardrobe from its Knowledge Base (upload .txt file)
  Re-upload the knowledge .txt file whenever wardrobe changes

IMPORTANT LIMITS:
  Characters API uses gwm1_avatars model via WebRTC — real-time, not async
  You CANNOT call Characters API from Python directly for real-time sessions
  Characters = Next.js SDK only for the video call part
  Python backend creates/configures the character; React SDK runs the call
```

---

## 8. Backend: FastAPI Python — All Routes

### `backend/main.py`
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import avatar, tryon, wardrobe, outfits, scrape, stylist
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="StyleAI API", version="1.0.0")

# CORS — allow Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(avatar.router,    prefix="/api/avatar",    tags=["Avatar"])
app.include_router(tryon.router,     prefix="/api/tryon",     tags=["Try-On"])
app.include_router(wardrobe.router,  prefix="/api/wardrobe",  tags=["Wardrobe"])
app.include_router(outfits.router,   prefix="/api/outfits",   tags=["Outfits"])
app.include_router(scrape.router,    prefix="/api/scrape",    tags=["Scrape"])
app.include_router(stylist.router,   prefix="/api/stylist",   tags=["Stylist"])

@app.get("/health")
def health(): return {"status": "ok"}
```

### `backend/models/schemas.py`
```python
from pydantic import BaseModel
from typing import Optional, List
from uuid import UUID

class TryOnRequest(BaseModel):
    user_id: str
    wardrobe_item_id: str
    item_image_url: str          # Supabase public URL of clothing
    avatar_selfie_url: str       # Supabase public URL of user selfie
    item_name: str
    model: str = "gen4_image"    # or gen4_image_turbo

class EventSceneRequest(BaseModel):
    tryon_result_url: str        # URL of the try-on image result
    event_context: str           # "beach wedding, golden hour"
    
class AnimateRequest(BaseModel):
    image_url: str               # try-on result image
    motion_prompt: str = "Person slowly walking, confident fashion pose"

class AddWardrobeItem(BaseModel):
    user_id: str
    name: str
    category: str
    occasion: Optional[str] = "casual"
    color: Optional[str] = None
    brand: Optional[str] = None
    tags: List[str] = []
    source_url: Optional[str] = None

class ScrapeRequest(BaseModel):
    url: str

class SaveOutfit(BaseModel):
    user_id: str
    name: str
    item_ids: List[str]
    occasion: Optional[str] = None
    preview_image_url: Optional[str] = None
```

### `backend/routers/tryon.py` — The Core Feature
```python
from fastapi import APIRouter, HTTPException, UploadFile, File
from models.schemas import TryOnRequest, EventSceneRequest, AnimateRequest
from services.runway_service import runway_generate_tryon, runway_event_scene, runway_animate
from services.supabase_service import save_tryon_result

router = APIRouter()

@router.post("/generate")
async def generate_tryon(req: TryOnRequest):
    """
    Core try-on endpoint.
    Takes user selfie URL + clothing item URL.
    Returns generated try-on image URL.
    
    IMPORTANT: Both URLs must be:
    - HTTPS (not localhost)
    - Publicly accessible 
    - Returning correct Content-Type header
    Use Supabase Storage public URLs.
    """
    try:
        result_url = await runway_generate_tryon(
            avatar_url=req.avatar_selfie_url,
            item_url=req.item_image_url,
            item_name=req.item_name,
            model=req.model
        )
        
        # Save result to DB
        result = await save_tryon_result(
            user_id=req.user_id,
            item_id=req.wardrobe_item_id,
            result_url=result_url,
            model_used=req.model
        )
        
        return {"result_image_url": result_url, "result_id": result["id"]}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/event-scene")
async def event_scene(req: EventSceneRequest):
    """
    Add an event background to a try-on result.
    Input: existing try-on image URL + event description text.
    Output: new image with event scene background.
    """
    try:
        result_url = await runway_event_scene(
            tryon_url=req.tryon_result_url,
            event_context=req.event_context
        )
        return {"event_image_url": result_url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/animate")
async def animate_tryon(req: AnimateRequest):
    """
    Convert a try-on image into a short video using gen4.5.
    Takes ~40-60 seconds. Returns video URL.
    """
    try:
        video_url = await runway_animate(
            image_url=req.image_url,
            motion_prompt=req.motion_prompt
        )
        return {"video_url": video_url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

### `backend/services/runway_service.py` — All Runway SDK Calls
```python
import os
from runwayml import RunwayML, TaskFailedError, TaskTimeoutError

client = RunwayML(api_key=os.getenv("RUNWAY_API_KEY"))

PROMPT_TRYON = """
Full body fashion photography of {person_desc} wearing {item_name}.
Studio lighting, clean neutral background, professional fashion editorial.
The person's face and body proportions are preserved exactly.
High resolution, photorealistic, sharp details.
"""

PROMPT_EVENT = """
{person_desc} standing at {event_context}.
Full body visible, the outfit is the focus.
Photorealistic, cinematic lighting, editorial fashion photography.
Natural pose, confident stance.
"""

PROMPT_ANIMATE = """
{motion_prompt}. Fashion model walk, smooth movement.
"""

async def runway_generate_tryon(
    avatar_url: str,
    item_url: str,
    item_name: str,
    model: str = "gen4_image"
) -> str:
    """
    Generate a try-on image.
    
    RULES:
    - avatar_url and item_url MUST be HTTPS Supabase Storage URLs
    - Both must return correct Content-Type headers
    - aspect ratio between 0.25 and 4.0
    """
    prompt = PROMPT_TRYON.format(
        person_desc="the person",
        item_name=item_name
    )
    
    try:
        task = client.text_to_image.create(
            model=model,
            prompt_text=prompt,
            ratio="768:1024",           # Portrait — best for fashion
            reference_images=[
                {"uri": avatar_url, "tag": "person"},   # Person reference
                {"uri": item_url,   "tag": "style"},    # Garment/style reference
            ]
        ).wait_for_task_output(timeout=300)  # 5 min timeout
        
        return task.output[0]
    
    except TaskFailedError as e:
        raise Exception(f"Runway generation failed: {e.task_details}")
    except TaskTimeoutError:
        raise Exception("Runway generation timed out after 5 minutes")


async def runway_event_scene(tryon_url: str, event_context: str) -> str:
    """Add event background to try-on result."""
    prompt = PROMPT_EVENT.format(
        person_desc="the person in the outfit",
        event_context=event_context
    )
    
    task = client.text_to_image.create(
        model="gen4_image",
        prompt_text=prompt,
        ratio="1024:1024",
        reference_images=[
            {"uri": tryon_url, "tag": "person"},
        ]
    ).wait_for_task_output(timeout=300)
    
    return task.output[0]


async def runway_animate(image_url: str, motion_prompt: str) -> str:
    """
    Animate a try-on image into a 5-second video.
    
    RULES:
    - image_url must be HTTPS
    - Input aspect ratio must be 0.5 to 2.0 for gen4.5
    - Duration: 5 or 10 seconds
    - Output ratio must match input aspect ratio approximately
    """
    task = client.image_to_video.create(
        model="gen4.5",
        prompt_image=image_url,
        prompt_text=motion_prompt,
        ratio="720:1280",      # Portrait for fashion videos
        duration=5,
    ).wait_for_task_output(timeout=300)
    
    return task.output[0]


async def runway_upload_ephemeral(image_bytes: bytes, content_type: str) -> str:
    """
    Upload image to Runway ephemeral storage.
    Returns runway:// URI valid for 24 hours.
    Use when you can't get a public HTTPS URL.
    Min size: 512 bytes. Max size: 200MB.
    """
    upload = client.assets.upload(
        data=image_bytes,
        content_type=content_type,
        name="upload.jpg"
    )
    return upload.uri  # "runway://..." — use in place of HTTPS URL
```

### `backend/routers/wardrobe.py`
```python
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from supabase import create_client
import os, uuid
from PIL import Image
import io

router = APIRouter()
supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY"))

@router.get("/{user_id}")
async def get_wardrobe(user_id: str, category: str = None, occasion: str = None):
    query = supabase.table("wardrobe_items").select("*").eq("user_id", user_id)
    if category: query = query.eq("category", category)
    if occasion: query = query.eq("occasion", occasion)
    result = query.order("created_at", desc=True).execute()
    return result.data

@router.post("/upload")
async def upload_item(
    file: UploadFile = File(...),
    user_id: str = Form(...),
    name: str = Form(...),
    category: str = Form(...),
    occasion: str = Form("casual"),
    color: str = Form(None),
    brand: str = Form(None),
):
    """Upload clothing photo and save to wardrobe."""
    # Validate image
    content = await file.read()
    if len(content) > 16 * 1024 * 1024:  # 16MB limit
        raise HTTPException(400, "Image too large. Max 16MB.")
    
    # Upload to Supabase Storage
    ext = file.filename.split(".")[-1].lower()
    if ext not in ["jpg", "jpeg", "png", "webp"]:
        raise HTTPException(400, "Only JPG, PNG, WebP allowed")
    
    filename = f"{user_id}/{uuid.uuid4()}.{ext}"
    supabase.storage.from_("wardrobe").upload(
        filename, content,
        file_options={"content-type": file.content_type}
    )
    
    # Get public URL
    image_url = supabase.storage.from_("wardrobe").get_public_url(filename)
    
    # Save to DB
    item = supabase.table("wardrobe_items").insert({
        "user_id": user_id,
        "name": name,
        "category": category,
        "occasion": occasion,
        "color": color,
        "brand": brand,
        "image_url": image_url,
    }).execute()
    
    return item.data[0]

@router.delete("/{item_id}")
async def delete_item(item_id: str):
    supabase.table("wardrobe_items").delete().eq("id", item_id).execute()
    return {"deleted": True}
```

### `backend/routers/scrape.py` — URL → Product Image
```python
from fastapi import APIRouter, HTTPException
from models.schemas import ScrapeRequest
import httpx
from bs4 import BeautifulSoup

router = APIRouter()

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

@router.post("/product-url")
async def scrape_product_url(req: ScrapeRequest):
    """
    Scrape product image and name from any URL.
    Tries og:image first (works on most e-commerce sites).
    Falls back to largest <img> tag.
    
    KNOWN LIMITATIONS:
    - Amazon sometimes blocks scraping → suggest user copies image URL directly
    - Dynamic sites (React/Vue) may not have og:image
    - Always test with the target site first
    """
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=10.0) as client:
            resp = await client.get(req.url, headers=HEADERS)
        
        if resp.status_code != 200:
            raise HTTPException(400, f"Could not fetch URL (status {resp.status_code}). Try pasting the image URL directly.")
        
        soup = BeautifulSoup(resp.text, "html.parser")
        
        # Extract product image
        image_url = (
            soup.find("meta", property="og:image") or
            soup.find("meta", attrs={"name": "og:image"})
        )
        image_url = image_url["content"] if image_url else None
        
        # Extract product name
        title = (
            soup.find("meta", property="og:title") or
            soup.find("meta", attrs={"name": "og:title"})
        )
        name = title["content"] if title else soup.find("title").text if soup.find("title") else "Product"
        
        if not image_url:
            raise HTTPException(400, "Could not find product image. Please upload a photo directly or paste the image URL.")
        
        return {
            "image_url": image_url,
            "name": name[:80],  # Truncate long names
            "source_url": req.url
        }
    
    except httpx.TimeoutException:
        raise HTTPException(408, "URL took too long to load.")
    except Exception as e:
        raise HTTPException(500, str(e))
```

### `backend/routers/avatar.py` — Avatar Setup
```python
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from supabase import create_client
import os, uuid

router = APIRouter()
supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY"))

@router.post("/upload-selfie")
async def upload_selfie(
    file: UploadFile = File(...),
    user_id: str = Form(...),
):
    """
    Upload user selfie to Supabase Storage.
    Returns public URL to use in Runway Custom Avatar creation.
    
    IMPORTANT: After this, the user must:
    1. Go to dev.runwayml.com → Characters → Create Character
    2. Upload this selfie URL
    3. Copy the character UUID back into the app
    
    OR we store the selfie and create the character via API if available.
    """
    content = await file.read()
    ext = file.filename.split(".")[-1].lower()
    filename = f"selfies/{user_id}/{uuid.uuid4()}.{ext}"
    
    supabase.storage.from_("selfies").upload(
        filename, content,
        file_options={"content-type": file.content_type}
    )
    
    image_url = supabase.storage.from_("selfies").get_public_url(filename)
    
    # Save selfie URL to user record
    supabase.table("users").upsert({
        "id": user_id,
        "avatar_selfie_url": image_url,
    }).execute()
    
    return {"selfie_url": image_url}


@router.post("/save-character")
async def save_character_id(
    user_id: str,
    character_id: str,
    voice_id: str = None
):
    """Save Runway character UUID to user record after manual creation."""
    supabase.table("users").update({
        "avatar_character_id": character_id,
        "avatar_voice_id": voice_id,
    }).eq("id", user_id).execute()
    
    return {"success": True}


@router.post("/sync-wardrobe-knowledge")
async def sync_wardrobe_to_knowledge(user_id: str):
    """
    Generate a wardrobe summary text and save it.
    The user then manually uploads this to the Character's Knowledge Base
    in the Runway Dev Portal, OR we handle it via API if available.
    """
    items = supabase.table("wardrobe_items").select("*").eq("user_id", user_id).execute()
    
    lines = ["USER WARDROBE:\n"]
    for item in items.data:
        tags = ", ".join(item.get("tags", []))
        lines.append(
            f"- {item['name']} | Category: {item['category']} | "
            f"Occasion: {item.get('occasion','any')} | "
            f"Color: {item.get('color','unknown')} | "
            f"Brand: {item.get('brand','unknown')} | Tags: {tags}"
        )
    
    wardrobe_text = "\n".join(lines)
    return {"wardrobe_text": wardrobe_text, "item_count": len(items.data)}
```

---

## 9. Frontend: Next.js — All Pages & Components

### `frontend/app/api/avatar/connect/route.ts`
> **REQUIRED** — This is the server-side token exchange for Runway Characters SDK.
```typescript
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { avatarId } = await request.json();

  const response = await fetch("https://api.runwayml.com/v1/realtime_sessions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.RUNWAYML_API_SECRET}`,
      "Content-Type": "application/json",
      "X-Runway-Version": "2024-11-06",
    },
    body: JSON.stringify({
      model: "gwm1_avatars",
      avatar: { type: "custom", avatarId },
    }),
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: response.status }
    );
  }

  const data = await response.json();
  return NextResponse.json(data);
}
```

### `frontend/lib/api.ts` — Backend Fetch Wrapper
```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function apiPost<T>(endpoint: string, data: object): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(err.detail || `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function apiGet<T>(endpoint: string): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export async function apiUpload<T>(endpoint: string, formData: FormData): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    body: formData,  // Don't set Content-Type header — browser sets multipart boundary
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Upload failed" }));
    throw new Error(err.detail);
  }
  return res.json();
}
```

### `frontend/store/app.ts` — Zustand Store
```typescript
import { create } from "zustand";

interface WardrobeItem {
  id: string;
  name: string;
  category: string;
  occasion: string;
  color?: string;
  brand?: string;
  image_url: string;
  tags: string[];
}

interface AppState {
  userId: string;
  avatarCharacterId: string | null;
  avatarSelfieUrl: string | null;
  wardrobeItems: WardrobeItem[];
  selectedItem: WardrobeItem | null;
  tryOnResult: string | null;    // Current try-on image URL
  videoResult: string | null;    // Current animated video URL
  isGenerating: boolean;
  generationStep: string;        // "Uploading..." | "Generating..." | "Done"
  
  // Actions
  setUser: (id: string) => void;
  setAvatar: (characterId: string, selfieUrl: string) => void;
  setWardrobe: (items: WardrobeItem[]) => void;
  addWardrobeItem: (item: WardrobeItem) => void;
  selectItem: (item: WardrobeItem | null) => void;
  setTryOnResult: (url: string | null) => void;
  setVideoResult: (url: string | null) => void;
  setGenerating: (generating: boolean, step?: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  userId: "demo-user-001",  // Hardcode for hackathon demo
  avatarCharacterId: null,
  avatarSelfieUrl: null,
  wardrobeItems: [],
  selectedItem: null,
  tryOnResult: null,
  videoResult: null,
  isGenerating: false,
  generationStep: "",

  setUser: (id) => set({ userId: id }),
  setAvatar: (characterId, selfieUrl) => set({ avatarCharacterId: characterId, avatarSelfieUrl: selfieUrl }),
  setWardrobe: (items) => set({ wardrobeItems: items }),
  addWardrobeItem: (item) => set((s) => ({ wardrobeItems: [item, ...s.wardrobeItems] })),
  selectItem: (item) => set({ selectedItem: item }),
  setTryOnResult: (url) => set({ tryOnResult: url }),
  setVideoResult: (url) => set({ videoResult: url }),
  setGenerating: (generating, step = "") => set({ isGenerating: generating, generationStep: step }),
}));
```

### `frontend/components/stylist/AvatarWidget.tsx`
```tsx
"use client";
import { AvatarCall } from "@runwayml/avatars-sdk-react";
import { useAppStore } from "@/store/app";

export function AvatarWidget() {
  const { avatarCharacterId } = useAppStore();
  
  if (!avatarCharacterId) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <div className="text-center">
          <p className="text-xl mb-2">Avatar not set up yet</p>
          <p className="text-sm">Go to Avatar Setup to create your personal stylist</p>
        </div>
      </div>
    );
  }
  
  return (
    <AvatarCall
      // This calls our /api/avatar/connect route which handles auth
      onGetSessionCredentials={async () => {
        const res = await fetch("/api/avatar/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ avatarId: avatarCharacterId }),
        });
        return res.json();
      }}
      onSessionEnd={() => console.log("Session ended")}
    />
  );
}
```

---

## 10. UI Design System — Win With Visuals

> This is a hackathon. Judges see dozens of projects. A beautiful UI that feels premium wins.
> Follow this design system exactly. Do NOT deviate to generic white/purple gradient AI aesthetics.

### Design Direction: **Luxury Editorial Dark**
Think: high-fashion magazine meets sci-fi. Vogue meets Blade Runner.
Palette is deep, almost-black with warm gold accents. Not cold blue. Not purple gradients. GOLD.

### CSS Variables (copy into `globals.css`)
```css
:root {
  /* Backgrounds — layered dark surfaces */
  --bg:        #08080d;   /* Page background — deepest */
  --surface:   #0f0f16;   /* Cards, sidebar */
  --surface2:  #16161f;   /* Inputs, secondary cards */
  --surface3:  #1e1e2a;   /* Hover states */
  
  /* Borders */
  --border:       rgba(255, 255, 255, 0.06);
  --border-hover: rgba(255, 255, 255, 0.12);
  --border-gold:  rgba(201, 168, 76, 0.25);
  
  /* Text */
  --text:       #f0ece4;   /* Primary — warm white, not pure white */
  --text-muted: #7a7a8a;   /* Secondary */
  --text-dim:   #4a4a5a;   /* Placeholders, disabled */
  
  /* Brand: Warm Gold */
  --gold:       #c9a84c;
  --gold-light: #e8cc7a;
  --gold-dim:   rgba(201, 168, 76, 0.10);
  --gold-glow:  rgba(201, 168, 76, 0.20);
  
  /* Accents */
  --purple: #8b6fe8;
  --teal:   #5cb8b2;
  --rose:   #e87f8a;
  
  /* Radii */
  --radius-sm: 10px;
  --radius:    16px;
  --radius-lg: 24px;
  
  /* Sidebar */
  --sidebar-width: 248px;
}

/* Fonts */
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500;600&display=swap');

/* Display font for headings, logo, numbers */
.font-display { font-family: 'Cormorant Garamond', serif; }
/* Body font for everything else */
body { font-family: 'DM Sans', sans-serif; }
```

### Key UI Rules for Claude Code
```
1. NEVER use pure white (#ffffff) for backgrounds — use var(--bg) through var(--surface3)
2. NEVER use Inter, Roboto, or Arial — use DM Sans (body) + Cormorant Garamond (headings)
3. ALL page titles, stat numbers, outfit names → Cormorant Garamond
4. Primary action buttons → var(--gold) background, dark text (#08080d)
5. Secondary buttons → var(--surface2) with var(--border) border
6. EVERY card has: border-radius var(--radius), border 1px var(--border), background var(--surface)
7. Hover on cards: border-color var(--border-hover), translateY(-2px), box-shadow
8. Loading states MUST have animation — spinner or shimmer skeleton
9. ALL transitions: 0.2s cubic-bezier(0.4, 0, 0.2, 1)
10. Use framer-motion for page transitions and result reveals
11. Sidebar: fixed, 248px wide, dark, gold accent on active item
12. The try-on result reveal MUST animate — fade in + scale up from 0.95
13. Gradients: use sparingly, always dark-to-dark (never white gradients)
14. Status indicators: gold dot for generating, green for done, red for error
```

### Framer Motion — Key Animations
```tsx
// Page entry animation — use on every page
const pageVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] } }
};

// Try-on result reveal — dramatic, memorable
const resultVariants = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: { 
    opacity: 1, scale: 1,
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] }  // Spring-like
  }
};

// Wardrobe card stagger
const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.05, duration: 0.3 }
  })
};

// Usage:
<motion.div variants={resultVariants} initial="hidden" animate="visible">
  <img src={tryOnResult} alt="Try-on result" />
</motion.div>
```

### The Generating State (Make This Perfect)
```
When Runway is generating (15-60 seconds), show:
1. Animated gradient shimmer where result will appear
2. Progress text that cycles: "Analyzing outfit..." → "Compositing your avatar..." → "Adding finishing touches..."
3. A subtle progress bar that fills over ~30s (even if not real progress)
4. The user's avatar selfie and the clothing item side-by-side with a "✦" spinning between them
5. Estimated time remaining counter

This is the most-seen state during a live demo. Make it BEAUTIFUL.
```

---

## 11. Wow Factor Add-ons

These features push you from 3rd to 1st place. Implement in priority order.

### Priority 1 — Before/After Reveal Slider ⚡
After try-on generates, show a drag slider between the original selfie and the try-on result.
Nothing communicates "this actually works" better than side-by-side comparison.

```tsx
// components/ui/BeforeAfterSlider.tsx
// Use react-compare-slider: npm install react-compare-slider
import { ReactCompareSlider, ReactCompareSliderImage } from "react-compare-slider";

<ReactCompareSlider
  itemOne={<ReactCompareSliderImage src={originalSelfieUrl} alt="Before" />}
  itemTwo={<ReactCompareSliderImage src={tryOnResultUrl} alt="After" />}
  style={{ borderRadius: "16px", overflow: "hidden" }}
/>
```

### Priority 2 — Real-Time Generation Progress Feed ⚡
While Runway generates, show a live log of what's happening:
```
[✓] Avatar analyzed
[✓] Garment detected  
[⟳] Compositing outfit... (this is where it spends most time)
[ ] Applying lighting
[ ] Final render
```
This makes 30 seconds feel intentional and impressive, not just a spinner.

### Priority 3 — Smart Outfit Suggestions ⚡
When user opens Studio, auto-suggest 3 outfit combinations from their wardrobe.
Call a simple Python endpoint that picks items with complementary occasions.
Show as cards: "For the office", "Weekend casual", "Evening out".

### Priority 4 — Share Card Generator
After try-on generates, offer a "Share Card" button that creates a beautifully designed
image card (avatar + outfit name + StyleAI branding) using HTML Canvas or a simple
design template. One-click download. Judges love shareable moments.

### Priority 5 — Multi-Item Try-On (Full Outfit)
Let users select 2-3 items simultaneously (top + bottom + shoes) and generate a combined
outfit try-on. Use a combined prompt: "Person wearing [top], [bottom], and [shoes]".
This is technically simple (just change the prompt) but looks very advanced.

### Priority 6 — Outfit History Timeline
On the Dashboard, show a timeline view of all try-ons with timestamps.
Click any historical result to re-open it in Studio.
Small feature, huge perceived polish.

### Priority 7 — Avatar Speaking During Generation
While Runway generates the try-on image, show a pre-recorded (or TTS) message
from the avatar: "I'm putting together your look — give me just a moment!"
Makes the wait feel like a conversation, not a loading screen.

---

## 12. 3-Day Build Schedule

> Strict priorities. If something isn't on the schedule, skip it until Day 3.

### 🗓️ FRIDAY, MAY 8

**9:00 — Watch Runway kickoff + API walkthrough (mandatory)**

**10:00 — Project Setup (90 min)**
```bash
# Do this in order, don't skip steps
mkdir styleai && cd styleai

# Backend
mkdir backend && cd backend
python -m venv venv && source venv/bin/activate
pip install fastapi uvicorn runwayml supabase python-multipart httpx beautifulsoup4 Pillow python-dotenv
# Create main.py, routers/, services/, models/ folders
cd ..

# Frontend  
npx create-next-app@latest frontend --typescript --tailwind --app --no-src-dir
cd frontend
npm install @runwayml/avatars-sdk-react @supabase/supabase-js zustand lucide-react framer-motion
npm install react-compare-slider  # For before/after slider
```

**11:30 — Supabase Setup (30 min)**
- Create project at supabase.com
- Run the SQL schema from Section 6
- Create storage buckets: wardrobe, selfies, tryons (all public)
- Copy URL + keys to .env files

**12:00 — Test Runway API (45 min)**
```python
# test_runway.py — run this FIRST, prove the API works
from runwayml import RunwayML
client = RunwayML(api_key="your_key")

# Test with a PUBLIC image URL (use a Supabase-hosted test image)
task = client.text_to_image.create(
    model="gen4_image",
    prompt_text="Full body fashion photo of a person wearing a blue blazer, studio lighting",
    ratio="768:1024",
).wait_for_task_output(timeout=120)
print("SUCCESS:", task.output[0])
```
> If this fails, debug before writing ANY other code.

**13:00 — Backend Core Routes (3 hrs)**
- `main.py` with CORS
- `routers/wardrobe.py` — upload + get items
- `routers/scrape.py` — URL scraping
- `routers/tryon.py` + `services/runway_service.py` — basic try-on
- Test all routes with curl or FastAPI /docs

**16:00 — Frontend Shell (2 hrs)**
- `globals.css` with design tokens from Section 10
- `layout.tsx` with Sidebar + Topbar
- Dashboard page (static, no data yet)
- `lib/api.ts` fetch wrapper

**18:00 — Connect Frontend to Backend (1 hr)**
- Wardrobe page fetches real items from DB
- Add item modal → upload → appears in grid
- End-of-Day 1 goal: I can upload a clothing photo and see it in the wardrobe grid

**19:00 — Onboarding Page (1 hr)**
- Selfie upload → calls `/api/avatar/upload-selfie`
- Shows the public URL
- Instructions for creating Runway character (or manual entry of character ID)

---

### 🗓️ SATURDAY, MAY 9

**9:00 — Try-On Studio (4 hrs) — MOST IMPORTANT DAY**

Build in this exact order:
1. Studio page layout (3-column: item picker | canvas | controls)
2. Item picker — shows wardrobe items, clicking selects one
3. "Try On" button → calls `/api/tryon/generate` → shows loading state
4. Result appears with framer-motion reveal animation
5. Before/after slider toggle
6. "Animate" button → calls `/api/tryon/animate` → shows video player

Test with real images until the quality is good. Tweak prompts in `runway_service.py`.

**13:00 — Event Scene Mode (2 hrs)**
- Event text input + preset chips (beach wedding, job interview, etc.)
- "Preview at Event" button → calls `/api/tryon/event-scene`
- Shows event scene image alongside the standard try-on

**15:00 — URL Scraping Polish (1 hr)**
- Test with Amazon, ASOS, Zara, H&M URLs
- Build fallback: "paste image URL directly" if scraping fails
- Auto-fill name and category from scraped title

**16:00 — Outfits System (1.5 hrs)**
- "Save as Outfit" button in Studio
- Outfits gallery page
- Filter by occasion

**17:30 — Multi-Item Try-On (1 hr)**
- Allow selecting top + bottom in the item picker
- Combine into one prompt: "wearing [top] and [bottom]"

**18:30 — Generation Progress Experience (1.5 hrs)**
- Build the beautiful generating state (Section 11, Priority 2)
- Cycling status messages
- Animated progress bar
- This is what makes it look professional

---

### 🗓️ SUNDAY, MAY 10

**9:00 — Avatar Stylist Setup (2 hrs)**
- Go to dev.runwayml.com → create character with your selfie
- Set system prompt (see Section 8 avatar router for wardrobe prompt)
- Upload wardrobe knowledge .txt file
- Test in the Runway portal first
- Integrate into `/stylist` page with Runway React SDK

**11:00 — Stylist Page Polish (2 hrs)**
- Suggestion pills that send pre-built prompts
- Wardrobe peek sidebar showing what avatar knows
- "Try this on" client tool that navigates to Studio

**13:00 — Share Card Feature (1 hr)**
- Canvas-based share card generator
- One-click download button

**14:00 — Full UI Polish (3 hrs)**
- Every page: check loading states, error states, empty states
- All transitions smooth
- Mobile-responsive check
- No console errors
- Every button does something

**17:00 — Record Demo Video (2 hrs)**
- Follow the script in Section 14 EXACTLY
- Record in 4K if possible
- Use OBS Studio or Loom
- Practice 3x before final take
- Edit out any waiting/pauses

**19:00 — Submission**
- Fill out submission form
- Write 2-paragraph description focusing on: what it does + which Runway APIs it uses
- Submit before 9am Monday hard deadline

---

## 13. Credit Budget Strategy

**Total budget: 50,000 credits**

| Action | Est. Credits | Priority |
|--------|-------------|---------|
| Avatar creation (one-time) | ~200 | Essential |
| Try-on gen4_image_turbo | ~200-300 | Essential — use turbo for speed |
| Try-on gen4_image (HD) | ~400-600 | Use only for demo recording |
| Event scene gen4_image | ~300-400 | High |
| Animate gen4.5 (5s) | ~800-1200 | Use sparingly — only for demo |
| Multi-item try-on | ~300-400 | Medium |
| Avatar chat session (per min) | ~50-100 | Minimize test sessions |

**Rules:**
- Use `gen4_image_turbo` during development (faster + cheaper)
- Switch to `gen4_image` for the final demo recording only
- Only animate 2-3 looks for the demo — video costs 3x image
- Set a soft limit: stop at 40,000 credits, save 10,000 for demo recording
- Test with low-cost models first, upgrade prompts incrementally

---

## 14. Demo Script (Record This)

**Total target length: 2:30 — 3:00 minutes**
**Setup: Clean browser, no dev tools open, Runway backend warmed up, test images pre-loaded**

---

*[0:00]* Screen shows landing page / Dashboard

> "Meet StyleAI — the first wardrobe app where your personal AI stylist actually looks like you, knows every item you own, and can show you wearing anything, anywhere."

*[0:12]* Click Onboarding → show selfie upload → avatar created

> "I upload my photo once. Runway's Characters API generates my avatar instantly — no training, no waiting."

*[0:25]* Open Wardrobe page → click Add Item → paste Amazon URL

> "I paste any product URL — Amazon, ASOS, wherever — and StyleAI extracts the product image automatically."
*(scraped image appears in the form)*
> "I save it to my wardrobe."
*(item appears in grid)*

*[0:42]* Click "Try On" on the new item → Studio opens → click Generate

> "Now I click Try On. Runway's gen4_image model composites the outfit onto my avatar..."
*(beautiful generating state animation plays for ~20 seconds)*

*[0:58]* Result appears — framer-motion reveal animation

> "That's me. In that outfit. In under 30 seconds."
*(drag the before/after slider)*
> "The before and after — same face, same body, different outfit."

*[1:15]* Type "beach wedding, golden hour" → click Event Preview

> "Now I want to see how this looks at my friend's beach wedding."
*(generates — 15 seconds)*
> "Runway places me in the scene, wearing the outfit."

*[1:35]* Click Animate

> "And if I want to really see it in motion..."
*(5 second video plays of avatar walking/posing)*

*[1:50]* Navigate to AI Stylist page → avatar loads and speaks

> "But here's what makes StyleAI different — my stylist isn't a chatbot. It's my avatar. And it knows my entire wardrobe."

*[2:00]* Click suggestion pill: "What should I wear to a job interview?"

*(Avatar responds with specific items from the wardrobe by name)*

> "It just checked my wardrobe and gave me a specific recommendation using items I actually own."

*[2:20]* Click "Try this on" → Studio opens with that item

> "And one tap takes me straight to trying it on."

*[2:30]* Final shot of dashboard with results

> "StyleAI: your closet, your avatar, your stylist. Built in 3 days on the Runway API."

---

## 15. Common Errors & Fixes

### "URL not accessible" from Runway
```
Cause: Passing localhost URL or non-public URL to Runway API
Fix: Always upload to Supabase Storage first, use the public URL
Test: curl -I <your_url> — must return 200 with correct Content-Type
```

### CORS error in browser
```
Cause: FastAPI CORS not configured for localhost:3000
Fix: Check main.py CORSMiddleware — allow_origins must include "http://localhost:3000"
Also check: no trailing slash on the URL
```

### "TaskFailedError" from Runway
```
Cause: Bad prompt, image too small, wrong content-type, or content moderation
Fix 1: Check image is JPEG/PNG/WebP, not GIF
Fix 2: Check image is >100x100px
Fix 3: Simplify the prompt — remove any potentially flagged words
Fix 4: Check e.task_details for the specific reason
```

### Characters avatar not loading
```
Cause: Wrong API key in RUNWAYML_API_SECRET, or character ID is wrong
Fix: Go to dev.runwayml.com → copy character UUID exactly
Fix: Make sure /api/avatar/connect route exists in Next.js
Fix: Check browser network tab for the connect request — what does it return?
```

### Runway returning blurry/distorted results
```
Cause: Poor selfie quality, or clothing image is very low resolution
Fix: Use a high-quality, well-lit selfie (minimum 512x512px, ideally 1024x1024+)
Fix: Use product images that are clean, white/plain background, front-facing
Fix: Add to prompt: "high resolution, sharp details, professional photography"
```

### URL scraping blocked (Amazon)
```
Cause: Amazon has bot detection
Fix: Show user a fallback message: "Amazon blocked our scraper. Please right-click the product image → 'Copy image address' and paste below."
Add a direct image URL input field as the fallback
```

### Supabase "new row violates row-level security"
```
Cause: RLS is enabled but no matching policy
Fix: For hackathon, use the permissive "allow all" policies from Section 6
OR: Use service role key in backend (already set up in SUPABASE_SERVICE_ROLE_KEY)
NEVER use service role key in frontend code
```

---

*StyleAI Master Roadmap v2.0 — Python FastAPI + Next.js — Local Demo Build*
*Runway API Hackathon May 8–11, 2026*
*Start with: `uvicorn main:app --reload` + `npm run dev`*
