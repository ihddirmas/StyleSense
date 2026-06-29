# StyleSense — Issues, Roadmap & Implementation Status

> Consolidated from: issues.md, new.md, REFINEMENTS_CHECKLIST.md, UI_REFINEMENTS_SUMMARY.md, flow.md

---

## 🎯 Current Sprint Focus

**Phase:** UI Refinements & Mobile Support  
**Branch:** `feature/ui-refinements` (based on master with warm tan/gold aesthetic)  
**Demo Target:** Runway Hackathon (May 8–11, 2026)

---

## ✅ Recently Completed

| Item | File/Location | Status |
|------|---------------|--------|
| Warm tan/gold color scheme (#daa520) | `globals.css` CSS vars | ✅ |
| Boxy aesthetic (0px border-radius) | All components | ✅ |
| 2px strengthened borders | All components | ✅ |
| Removed "The atelier" eyebrow | `studio/page.tsx` | ✅ |
| Mobile hamburger navigation | `Topbar.tsx` | ✅ |
| ProgressBar component | `components/ui/ProgressBar.tsx` | ✅ |
| ALL CAPS nav labels | `Topbar.tsx` | ✅ |
| Brown border on Topbar | `Topbar.tsx` | ✅ |
| Wardrobe category cards (brown border + badge) | `dashboard/page.tsx` | ✅ |
| Wardrobe item cards (brown border + name badge) | `wardrobe/page.tsx` | ✅ |
| Dashboard shimmer skeletons (no spinner) | `dashboard/page.tsx` | ✅ |
| Outfits: removed "N looks" count | `outfits/page.tsx` | ✅ |
| Outfits: horizontal drag-scroll only | `outfits/page.tsx` | ✅ |
| Running task count in topbar | `Topbar.tsx` | ✅ |
| Cancel during generation | `studio/page.tsx` | ✅ |
| Model pickers (try-on + video) | `studio/page.tsx` | ✅ |
| Background task processing (non-blocking) | `store/tasks.ts` | ✅ |
| Default event scene presets | `studio/page.tsx` | ✅ |
| Wardrobe category filter chips | `wardrobe/page.tsx` | ✅ |
| Error/404 pages | `app/error.tsx`, `app/not-found.tsx` | ✅ |

---

## 🐛 Bugs

| # | Description | File | Status |
|---|-------------|------|--------|
| B1 | Studio empty-state canvas uses `aspectRatio: "3/4"` but result renders at natural height (72vh). Should both be `9:16`. | `frontend/app/studio/page.tsx` ~line 370 | ❌ Open |
| B3 | Runway rate-limit / load balancing — no retry/backoff on 429s in `runway_service.py`. | `backend/services/runway_service.py` | ❓ Unverified |
| B5 | Some pages overflow their container — content doesn't fit inside the screen (universal, excluding landing). | Multiple pages | ✅ Fixed |

---

## 🎨 Tweaks (Frontend)

| # | Description | File | Status |
|---|-------------|------|--------|
| T3 | "Items in this look" cards in Studio should match wardrobe card style (brown border + same thumbnail treatment). | `frontend/app/studio/page.tsx` ~line 390 | ❌ Open |
| T4 | The eyebrow + serif title pattern — consider removing subtitle if eyebrow already identifies the tab. | All page headers | ❓ Decide |
| T6 | Blank canvas state: SVG body silhouette (female default, male if bodyType=male). | `frontend/app/studio/page.tsx` | ✅ Fixed |
| T7 | ♀/♂ body type toggle added to Studio right panel "Selected" section (reads/writes Zustand bodyType). | `frontend/app/studio/page.tsx` right panel | ✅ Fixed |
| T11 | Wardrobe header row: action buttons should stay on one line (no wrap). | `frontend/app/wardrobe/page.tsx` | ✅ Fixed |

---

## ✨ Features — Frontend (Planned)

| # | Description | Status |
|---|-------------|--------|
| F1 | **Notifications bell** — dedicated icon that opens a drawer listing all background task history with status and result previews. | ✅ Fixed (running count shown inline) |
| F2 | **Landing page redesign** — editorial fashion experience (aiuta × stylz.in). 100vh hero + 3 feature sections + SEO JSON-LD. | ❌ Open — spec in `docs/superpowers/specs/2026-06-25-landing-page-design.md` |
| F3 | **"See previous" generations** — history drawer/tab showing past try-ons from Supabase. | ❌ Open |
| F4 | **Wardrobe sort** — ↓ New / ↑ Old / A–Z chips added to wardrobe header row. | ✅ Fixed (filter ✅, sort pending) |
| F5 | **Default faces to try on** — DiceBear illustrated defaults on /onboarding as placeholders. | 🔶 Partial — spec in `docs/superpowers/specs/2026-06-25-onboarding-redesign.md` |
| F6 | **Stylist page redesign** — Aria header with context count; suggestion chips as horizontal scroll strip inside chat; wider layout. | ✅ Fixed |
| F7 | **PNG garments + blank canvas** — when garment is cleaned, show transparent PNG; when outfit generated, blank bg until scene is selected. | ✅ Fixed |
| F8 | **Delete recent try-ons** — hover-reveal trash button on each recent try-on card in dashboard. | ✅ Fixed |

---

## ✨ Features — Backend (Planned)

| # | Description | Status |
|---|-------------|--------|
| B_F1 | **Default male body/silhouette** — alternate reference body for fit accuracy on male clothing. | ❌ Open |
| B_F2 | **Rate-limit handling** — exponential backoff on Runway 429s in `wait_for_task_output`. | ❌ Open |

---

## 🚀 Major UX Redesign (Post-Hackathon / Phase 2)

*From `flow.md` — major overhaul for "user is the model" experience*

### 1. Avatar Onboarding Enhancement
- Optional full-body standing photo upload on `/onboarding`
- Backend cuts background, runs Claude vision for body analysis + color palette
- Stores `body_analysis` JSONB on users table
- **Files:** `backend/routers/avatar.py`, `backend/services/anthropic_service.py`, `backend/models/schemas.py`, `frontend/app/onboarding/page.tsx`, `frontend/store/app.ts`
- **Schema:** `supabase_schema_v2g_body.sql`

### 2. Studio — Digital Walk-in Closet
- Left panel: category rails (hangers for clothing, shelves for accessories) — horizontally scrollable
- Center: circular platform with `stylizedAvatarUrl` (default body) → try-on result on generate
- Right panel: generation controls
- **New components:** `HangerRail.tsx`, `AccessoryShelf.tsx`, `BodyCanvas.tsx`
- **File:** `frontend/app/studio/page.tsx` (major rewrite)

### 3. Dashboard — "User Is the Model" Horizontal Scroll
- Hero: `stylizedVideoUrl` autoplay loop
- Below: horizontal scroll of recent try-ons as cut-outs on neutral chips
- **New component:** `TryOnReel.tsx`
- **File:** `frontend/app/page.tsx`

### 4. Chat — Photo Upload + Studio Send
- Camera icon in chat input → upload → send to stylist with image context
- Suggested items → "Try in Studio" button → navigates to Studio with items pre-selected
- **Files:** `backend/routers/stylist.py`, `frontend/app/stylist/page.tsx` (or `chat/page.tsx`)

### 5. Stylist — "This or That" Daily Tab
- A/B outfit cards from wardrobe, swipe to vote
- Accumulates `style_preferences` JSONB[] on users
- 5 votes/day limit
- **Files:** `backend/routers/stylist.py`, `backend/services/anthropic_service.py`, `frontend/app/stylist/page.tsx`
- **Schema:** `supabase_schema_v2h_preferences.sql`

---

## 📋 Remaining Polish Tasks (from REFINEMENTS_CHECKLIST)

### Image Optimization
- [ ] Replace wardrobe grid `<img>` with `<Image>` from next/image
- [ ] Add loading skeleton states for grids
- [ ] Implement lazy loading for offscreen images
- [ ] Add blur-up placeholder effect

### Grid Responsiveness
- [ ] Make wardrobe grid responsive (4col → 2col → 1col)
- [ ] Make studio grid responsive
- [ ] Adjust chat layout for mobile

### Progress Bar Integration
- [ ] Integrate ProgressBar into studio API calls
- [ ] Add estimated durations:
  - Try-on: 30-45s
  - Event scene: 20-30s
  - Animation: 60-90s
  - Upload: 5-10s

---

## 🗂️ Schema Migrations (Supabase)

| File | Applied | Purpose |
|------|---------|---------|
| `supabase_schema.sql` | ✅ | v1: users, wardrobe_items, try_on_results, outfits + storage buckets |
| `supabase_schema_v2_social.sql` | ✅ | v2: profiles, friendships, messages + RLS + trigger |
| `supabase_schema_v2b_fix.sql` | ✅ | Trigger hotfix |
| `supabase_schema_v2c_fix.sql` | ✅ | Trigger follow-up fix |
| `supabase_schema_v2d_selfies.sql` | ✅ | selfie_urls JSONB array |
| `supabase_schema_v2e_stylized.sql` | ✅ | stylized_avatar_url + status |
| `supabase_schema_v2f_stylized_video.sql` | ✅ | stylized_avatar_video_url + status |
| `supabase_schema_v2g_body.sql` | ❌ | body_analysis JSONB (for onboarding enhancement) |
| `supabase_schema_v2h_preferences.sql` | ❌ | style_preferences JSONB[] (for This or That) |

---

## 🔑 Critical Runway Credit Budget

| Operation | Model | Credits |
|-----------|-------|---------|
| Garment cleaner / isolate | gen4_image_turbo | 2 |
| Try-on | gen4_image_turbo | 2 |
| Event scene | gen4_image | 5 |
| Animate (5s video) | gen4.5 | 60–100 |
| Character creation | gen4_image | ~5 |
| **Total budget** | | **50,000** |

**Strategy:** Use `gen4_image_turbo` during dev. Switch to `gen4_image` only for demo recording.

---

## 🧪 Test Commands

```powershell
# Backend smoke tests
Set-Location backend
.\venv\Scripts\python.exe -m tests.test_runway_smoke       # ~2cr
.\venv\Scripts\python.exe -m tests.test_runway_full        # ~70cr (set $env:SKIP_ANIMATE="1" for ~10cr)
.\venv\Scripts\python.exe -m tests.test_auth_flow
.\venv\Scripts\python.exe -m tests.test_supabase_smoke
.\venv\Scripts\python.exe -m tests.test_anthropic_smoke
.\venv\Scripts\python.exe -m tests.test_wardrobe_flow
.\venv\Scripts\python.exe -m tests.test_garment_cleaner
.\venv\Scripts\python.exe -m tests.probe_detect_items      # ~$0.01

# Frontend
Set-Location frontend
npm run build    # production build + type-check
npm run lint     # ESLint only
```

---

## 📁 Key File Reference

| Area | Files |
|------|-------|
| **Backend entry** | `backend/main.py` |
| **Runway service** | `backend/services/runway_service.py` |
| **Supabase service** | `backend/services/supabase_service.py` |
| **Anthropic service** | `backend/services/anthropic_service.py` |
| **Garment cleaner** | `backend/services/garment_cleaner.py` |
| **Avatar pose service** | `backend/services/avatar_pose_service.py` |
| **Frontend store** | `frontend/store/app.ts` |
| **Frontend API** | `frontend/lib/api.ts` |
| **Studio page** | `frontend/app/studio/page.tsx` |
| **Dashboard** | `frontend/app/page.tsx` (or `app/dashboard/page.tsx` on feature branch) |
| **Wardrobe** | `frontend/app/wardrobe/page.tsx` |
| **Stylist** | `frontend/app/stylist/page.tsx` |
| **Onboarding** | `frontend/app/onboarding/page.tsx` |
| **Topbar** | `frontend/components/layout/Topbar.tsx` |
| **ProgressBar** | `frontend/components/ui/ProgressBar.tsx` |