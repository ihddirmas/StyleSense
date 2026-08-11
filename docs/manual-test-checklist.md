# Manual test checklist

Human-executable pass before a demo/judging pass. Covers what Playwright can't
easily judge (visual polish, AI response quality, real credit spend, actual
multi-account social flows) — see `frontend/e2e/*.spec.ts` for the automated
regression suite covering loading states, a11y, typography, and design-system
consistency.

**Test accounts** (seeded with wardrobe items — always use these for QA):
- `jaxisi8415@anawebs.com` / `admin23` — confirmed working, has wardrobe items
- `sisin49922@ellbit.com` / `admin23` — does **not** currently work, do not rely on it

**Feature flags** — `frontend/lib/features.ts`. Default build has `MVP_MODE=true`,
which turns off: hero video, event-scene placement, social (chat/friends),
voice avatar, stylized-avatar-on-upload. Items below marked **[MVP-cut]** only
apply when `NEXT_PUBLIC_MVP_MODE=false`.

---

## 1. Auth

- [ ] Sign up with a new email → lands on onboarding, no "database error"
- [ ] Sign in with an existing account → lands on Dashboard
- [ ] Sign in with wrong password → clear error message, no crash
- [ ] Sign out → redirected to `/login`, protected routes redirect back to login
- [ ] Refresh the page while signed in → session persists, no flash of logged-out state
- [ ] Visit `/login` or `/signup` while already signed in → redirected away (middleware)

## 2. Onboarding

- [ ] New user is routed to `/onboarding` before Dashboard
- [ ] Upload a selfie → preview shows, upload succeeds
- [ ] Selfie triggers stylized avatar generation in the background (check Dashboard hero later)
- [ ] Skip/complete onboarding → lands on Dashboard

## 3. Wardrobe

- [ ] `/wardrobe` with items → grid renders, images load
- [ ] `/wardrobe` empty state (fresh account) → "add your first item" CTA, no crash
- [ ] Add item via **photo upload** (single item) → cleaned image, item appears in grid
- [ ] Add item via **Amazon/retailer URL** → scrape succeeds, item added with `clean='none'`
- [ ] Add item via **photo with multiple garments** → `detect-items` review checklist appears, confirm adds all, partial failure doesn't corrupt the rest
- [ ] Delete an item → removed from grid, no orphaned references elsewhere
- [ ] Item cap / rate limit (if applicable) → clear message, not a silent failure

## 4. Studio (try-on)

- [ ] Select 1+ wardrobe items → "Empty wardrobe" banner never flashes before real data loads
- [ ] Generate try-on (turbo, 2cr) → progress state shows, result renders, before/after compare slider works
- [ ] Generate try-on (full quality, 5cr) → same, higher quality
- [ ] No avatar/selfie set → try-on is blocked with a clear message pointing to Settings, not a silent failure
- [ ] **[MVP-cut]** Place in event scene (preset chip or free text) → scene generates, credits deducted
- [ ] Animate result (gen4.5 video, ~60cr) → **UNTESTED per CLAUDE.md**, verify it completes and video plays
- [ ] Avatar refresh (regenerate stylized avatar) → respects monthly cap, clear message when cap hit
- [ ] Save outfit from Studio → appears in `/outfits`
- [ ] Download result with watermark → file downloads, watermark visible

## 5. Aria (Stylist chat)

- [ ] Open `/stylist`, start session → Aria responds without "Stylist failed" errors
- [ ] Ask a general style question (e.g. color season) → coherent answer, no crash
- [ ] Ask Aria to add an item from a URL → item actually lands in wardrobe (previously broken — verify still fixed)
- [ ] Ask Aria to recommend an outfit from wardrobe → references real items by name, not hallucinated ones
- [ ] Aria's suggestions require confirmation before spending credits (no surprise generations)
- [ ] **[MVP-cut]** Voice avatar tab → confirm it's absent in default MVP build (`Aria: voice tab no longer exists` covers this in E2E)

## 6. Dashboard

- [ ] Hero shows stylized avatar/video once generated (or "Generate my ramp video" button for legacy accounts without one)
- [ ] Usage pill (`N/N try-ons`) shows real numbers, updates after a try-on
- [ ] "Continue" card links to the right in-progress item
- [ ] Recent try-ons carousel renders real thumbnails
- [ ] Empty-state (fresh account) → "Add to closet / Try on / Talk to Aria" CTAs, no premature flash while data loads (covered by `cold-start.spec.ts`)
- [ ] Color/style-insight card → no fake/hardcoded data, reflects real profile once analysis completes; no stuck "processing" state

## 7. Outfits

- [ ] Saved outfits render with correct items and thumbnail
- [ ] **[MVP-cut]** Share outfit to a friend → recipient receives it in `/chat`

## 8. Settings

- [ ] Change primary selfie → triggers new stylized avatar + video generation
- [ ] Quality toggle (turbo vs. pro) persists and is respected in Studio
- [ ] Account/profile fields save correctly

## 9. Social (chat/friends) — **[MVP-cut, off by default]**

- [ ] With `NEXT_PUBLIC_MVP_MODE=false`: search for a friend, send request, accept
- [ ] Share a try-on/outfit into a chat thread → recipient sees it, can view full detail
- [ ] Realtime message delivery between two open sessions (two browsers/accounts)

## 10. Cross-cutting

- [ ] **Mobile (375px)**: Dashboard, Wardrobe, Studio, Aria all usable — no horizontal scroll, tap targets ≥44px, nav drawer works
- [ ] **Cold start**: throttle/delay the backend (or hit it after Render free-tier idle) — pages show a loading state, never a premature empty-state hint
- [ ] **Accessibility**: keyboard-only nav reaches all primary actions; screen reader announces page regions (landmarks, aria-labels present per the a11y pass)
- [ ] **SEO pages** (`/style/[slug]`): a sample of style guide pages render, sitemap/robots.txt are reachable and not redirected to `/login`
- [ ] **Credit budget awareness**: after a full manual pass, confirm remaining Runway credits are still comfortably within the 50,000 budget

## Known gaps (per CLAUDE.md, still unverified end-to-end)

- Animate endpoint (gen4.5 image-to-video)
- Custom character creation programmatic path
- Knowledge base document upload + attach
- Runway WebRTC realtime avatar session
- Full social loop end-to-end (two real users, friend, chat, share)
