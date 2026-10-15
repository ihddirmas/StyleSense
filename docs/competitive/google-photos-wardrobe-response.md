# Competitive response: Google Photos wardrobe + Shopping try-on

Status: active product direction (2026-10-15)  
Related: Google Photos wardrobe (summer 2026 rollout), [Google Shopping try-on](https://www.google.com/shopping/tryon)

## Verdict

Google owns **seamless ingest** (AI catalogs clothes already in Photos) and **generic try-on**. StyleSense must not compete on cutout utility alone. The wedge is **Personal AI Stylist** — Kibbe + seasonal color, Aria verdicts, capsule/gap planning — with capture UX that *feels* automatic on mobile.

## What Google ships

| Surface | Capability |
|---------|------------|
| Photos wardrobe | Auto-scan library → category filters → moodboards → try-on |
| Shopping try-on | Gemini image model, try catalog looks on a digital you |

User friction for Google ≈ 0 for closet building. Ours today ≈ modal + one photo at a time.

## What we ship / park / never chase

### Ship now (this track)

1. **Multi-photo gallery import** — pick several camera-roll photos; detect + isolate per photo with progress.
2. **Items grid that reads like cutouts** — soft tile, `object-contain`, prefer `cutout_url` when present.
3. **Create FAB** — select pieces → Create → Studio (outfit compose / try-on).
4. **Best-effort cutouts on new adds** — transparent PNG for display; try-on still uses `image_url`.
5. **PWA polish** — existing standalone manifest; keep mobile-first wardrobe layout.

### Next

- Occasion filters (API already supports; UI unused).
- Chat-drop batch (Aria already has single-photo detect-confirm).
- Subcategory chips derived from tags/name heuristics once data quality is good enough.
- Installable icons / install prompt for PWA.

### Park

- Full offline service worker.
- Native iOS/Android apps (PWA + responsive first).
- B2C seller photography pipeline (roadmap Track E).

### Never chase

- Out-scanning Google Photos' library (we will never own the photo OS).
- Pure "background remover" positioning.
- Voice/video Aria as the primary surface (already soft-deprecated).

## Positioning line

> Google organizes what you wore. StyleSense tells you what suits you — and makes building that closet from your camera roll as close to automatic as a web app can get.

## Success signals

- Time-to-first-5-wardrobe-items drops (gallery batch vs single upload).
- Wardrobe sessions that reach Studio via Create FAB.
- Aria verdict / analysis engagement stays the retention loop, not cutout novelty.
