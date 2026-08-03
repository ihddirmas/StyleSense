# Devpost submission draft — Backblaze Gen Media Hackathon

> Paste into Devpost. Deadline: **Aug 3, 2026 @ 5:00pm EDT**.  
> Live app + API health: see README “Live deployment” table (Vercel frontend · Render `/health`).

---

## Project name

**StyleSense** — Agentic AI stylist with Genblaze → Backblaze B2 media pipeline

*(Short form if needed: `StyleSense — Agentic Stylist + Genblaze/B2`)*

---

## Elevator pitch / tagline

Know what flatters you before you buy — Aria verdicts your closet & URLs; try-ons and runway clips archive to B2 via Genblaze.

---

## Thumbnail

Use a **3:2** crop of Studio try-on + Aria chat (or landing hero). Prefer JPG/PNG under 5 MB.  
Suggested source: `docs/screenshots/` or a fresh capture of `/stylist` verdict + `/studio` B2 banner.

---

## About the project (Markdown)

### Inspiration

I kept watching color-analysis and Kibbe content online, then still bought clothes that looked wrong on me. StyleSense started as a personal answer: **what actually flatters *me*** — not another generic try-on toy. For the Backblaze Gen Media hackathon, the missing piece was durability: Runway CDN links expire, credits are expensive to re-spend, and judges care about **pipeline + provenance**, not just pretty frames.

### What it does

1. **Onboarding** — face + body photos → color season + Kibbe profile.  
2. **Aria (agentic stylist)** — LangGraph + Claude tools: URL lookup, wardrobe search, Suits/Borderline/Avoid verdicts, confirm-gated try-on & wardrobe add & save outfit.  
3. **Studio** — multi-item virtual try-on + event scenes.  
4. **Genblaze → B2** — try-on stills ingested with SHA-256 manifests; image-to-video animate sinks to Backblaze B2 under per-user hierarchical keys.

### How I built it

- **Frontend:** Next.js 14 (Vercel) + Supabase Auth  
- **Backend:** FastAPI on Render · LangGraph stylist (`graphs/aria_graph.py`) · `services/genblaze_media_service.py`  
- **Storage:** Supabase (hot CDN for UI) + **Backblaze B2** (durable archive)  
- **Models:** Runway `gen4_image` / video · Anthropic Claude · Genblaze `Pipeline` + `RunwayProvider` + `ObjectStorageSink`

### What I learned

- Agentic UX needs **human-in-the-loop confirms** when tools spend credits.  
- Gen media apps die without **durable storage + manifests** — B2 + Genblaze made “demo magic” into an auditable pipeline.  
- Production readiness is half the prize: auth, caps, health (`b2_configured`), and a judge-loginable seed account matter as much as the model call.

### Challenges

- Pooler vs direct Supabase URLs (IPv6-only `db.*.supabase.co` broke Render).  
- Keeping Genblaze/B2 visible for judges without turning the product UI into an SDK advertisement.  
- Credit budget discipline (turbo vs full quality; animate ~60–100 cr).

---

## Built with (tags)

`python` `fastapi` `nextjs` `typescript` `supabase` `runway` `anthropic` `claude` `langgraph` `genblaze` `backblaze` `b2` `vercel` `render` `tailwind` `zustand` `posthog` `virtual-try-on` `ai-agent` `provenance`

---

## Try it out links

1. **App:** Vercel production URL from README live table  
2. **API health / B2 proof:** `https://styleai-backend-5vk9.onrender.com/health`  
3. **Media pipeline status:** `https://styleai-backend-5vk9.onrender.com/api/media/status`  
4. **GitHub:** `https://github.com/ihddirmas/StyleSense`  

*(If repo is private: grant https://github.com/b2genblaze contributor access.)*

**Judge login:** use the seeded demo account (wardrobe + selfies preloaded) — do not sign up new users during judging.

---

## Project media gallery

Upload up to 15 images (3:2 preferred), e.g.:

1. Landing hero  
2. Aria verdict on a product URL  
3. Confirm-gated try-on card  
4. Studio try-on result  
5. B2 / Genblaze provenance banner  
6. Animate → runway clip frame  
7. Color + Kibbe profile cards  
8. Wardrobe grid  

---

## Video demo link

~3 min. Script: `docs/hackathons/BACKBLAZE_GEN_MEDIA_2026.md` (Demo video script).  
Must show: Aria verdict → Studio try-on → **Genblaze animate → B2** → manifest/provenance.

---

## App URL

Paste the Vercel production frontend URL from the README live deployment table.

---

## GitHub Repo URL

https://github.com/ihddirmas/StyleSense

---

## Providers and models

| Provider | Models / APIs | Role |
|----------|---------------|------|
| **Runway** | `gen4_image_turbo`, `gen4_image`, image-to-video (veo3.1 / gen4.5), Characters | Garment isolate, try-on, scenes, animate, voice stylist |
| **Anthropic** | Claude (Haiku + Sonnet for advise) | Aria agent reasoning, vision multi-item detect, color/Kibbe assist |
| **Genblaze** | `Pipeline`, `Pipeline.ingest`, `RunwayProvider`, `ObjectStorageSink` | Orchestrate generate → store with manifests |
| **Backblaze B2** | S3-compatible object storage | Durable try-on + video archive + provenance |
| **Supabase** | Auth, SQL database, Storage, Realtime | Users, wardrobe, hot CDN assets |
| **Vercel / Render** | Hosting | Frontend / API |

---

## B2 and Genblaze usage

StyleSense uses **Genblaze** to run Runway image-to-video inside a `Pipeline` with a Backblaze B2 `ObjectStorageSink`, emitting verifiable SHA-256 manifests for each animate run. Try-on stills are archived via **`Pipeline.ingest`** after generation, with provenance metadata (user, try-on id, models, item ids). Supabase serves low-latency UI assets; **B2 is the durable system of record** with `image_manifest_hash` / `video_manifest_hash` on each look.

Bucket keys (hierarchical):

```
{user_id}/stylesense-tryon/...
{user_id}/stylesense-animate/...
```

Verify live: `GET /health` → `"b2_configured": true` and `GET /api/media/status`.
