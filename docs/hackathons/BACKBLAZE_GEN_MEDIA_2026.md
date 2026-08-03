# Backblaze Generative AI Media Hackathon — StyleSense submission

> **Devpost:** [backblaze-generative-media.devpost.com](https://backblaze-generative-media.devpost.com/)  
> **Deadline:** August 3, 2026, 5:00 PM ET  
> **Live app:** [https://style-sense-beryl.vercel.app](https://style-sense-beryl.vercel.app) (`master` on GitHub)  
> **Repo:** [github.com/ihddirmas/StyleSense](https://github.com/ihddirmas/StyleSense)

---

## Elevator pitch (Devpost description)

**StyleSense** is an AI wardrobe and virtual try-on studio. Users upload a selfie, build a digital closet, and generate photoreal outfit composites and runway videos with **Runway** (`gen4_image`, `veo3.1`). **Aria**, our agentic stylist (LangGraph + Claude tool-calling), reasons over the full wardrobe, proposes looks, and can trigger try-on generation with human-in-the-loop confirmation.

For this hackathon we added a **production-minded media pipeline**: **Genblaze** orchestrates Runway image-to-video steps and emits **SHA-256 provenance manifests**; **Backblaze B2** durably stores generated try-ons, videos, and manifests—so looks survive beyond ephemeral provider URLs and remain auditable.

---

## Problem & audience

**Who:** Fashion-conscious shoppers and creators who want to *see* outfits on themselves before buying or posting—not generic mannequin renders.

**Pain:** Try-on and video outputs are large, expensive to regenerate, and often live on short-lived CDN links. Creators need a closet-aware stylist, not a stateless chatbot.

**Why they’d use it:** One app goes from wardrobe → styled recommendation → try-on still → animated runway clip, with an agent that knows their items by ID.

---

## What we built (mapped to hackathon criteria)

| Criterion | How StyleSense scores |
|-----------|----------------------|
| **Real-world utility** | Virtual try-on + event scenes + shareable looks; Aria picks real wardrobe items (`[ITEM:uuid]`) for a stated occasion. |
| **Production readiness** | Live Vercel + Render deploy, auth, usage caps, rate limits, Aurora + Supabase, keep-alive on backend. |
| **Production readiness** | Live Vercel + Render deploy, auth, usage caps, rate limits, Supabase DB, keep-alive on backend. |
| **B2 storage & orchestration** | B2 bucket stores ingested try-ons + Genblaze-run videos; hierarchical keys per user; public or signed URLs via `B2_PUBLIC_URL_BASE`. |
| **Genblaze** | `Pipeline` + `RunwayProvider` for animate; `Pipeline.ingest` for try-on archive; manifests verified with `manifest.verify()`. |

---

## AI providers & models

| Provider | Models | Use in StyleSense |
|----------|--------|-------------------|
| **Runway** | `gen4_image`, `gen4_image_turbo`, `veo3.1`, `veo3.1_fast`, `gen4_turbo` | Try-on compositing, event scenes, ramp-walk video |
| **Anthropic** | `claude-sonnet-4-6` (Aria advise), `claude-haiku-4-5` (vision/helpers) | Agentic stylist chat, wardrobe detect, prompt enhance |
| **Supabase** | Auth, Storage, Realtime | Hot CDN for UI; social tables |

---

## B2 usage (meaningful)

**Bucket layout** (via Genblaze `KeyStrategy.HIERARCHICAL`):

```
{tenant_id}/stylesense-tryon/...   # ingested try-on JPEG/PNG + manifest
{tenant_id}/stylesense-animate/... # Genblaze Runway video outputs + manifest
```

**What we store:**

- Generated **try-on images** (ingested from Supabase/Runway HTTPS URLs after generation)
- **Animated runway videos** (Genblaze pipeline output landed directly in B2)
- **Provenance manifests** (SHA-256 canonical hash per run; verifiable downstream)

**Why B2:** Runway and composite URLs expire; B2 is the durable system of record for a user’s look library and audit trail. Supabase stays the **hot CDN** for fast UI loads (`result_image_url`); `b2_image_url` + `image_manifest_hash` on each row is the **cold archive** with verifiable provenance. API video playback prefers `b2_video_url` when present.

**Env vars:** `B2_BUCKET`, `B2_KEY_ID`, `B2_APP_KEY`, optional `B2_REGION`, `B2_PUBLIC_URL_BASE`.

---

## Genblaze usage (meaningful)

**1. Image-to-video pipeline** (`services/genblaze_media_service.py`)

```python
Pipeline("stylesense-animate", project_id=user_id)
  .step(RunwayProvider(), model="veo3.1", modality=VIDEO,
        prompt=..., params={"prompt_image": tryon_url, "ratio": "720:1280"})
  .run(sink=ObjectStorageSink(S3StorageBackend.for_backblaze(...)))
```

Used by `POST /api/tryon/animate` when B2 is configured (falls back to direct Runway SDK otherwise).

**2. Ingest pipeline** (try-on archive)

```python
Pipeline.ingest(
  assets=[Asset(url=tryon_https_url, media_type="image/jpeg")],
  source="stylesense-tryon",
  source_metadata={"user_id", "tryon_id", "model_used", "item_ids"},
  sink=...,
)
```

Runs after `run_multi_tryon` succeeds—archives the still with ingest provenance without re-running generation.

**3. Agentic hook (USP)**

Aria’s `generate_tryon` tool → `tryon_service.run_multi_tryon` → optional B2 ingest. The **agent** decides *when* to generate; Genblaze + B2 handle *how* outputs are orchestrated and stored.

---

## Architecture (prompt → pipeline → B2)

```mermaid
flowchart LR
  User --> Aria[Aria LangGraph Agent]
  User --> Studio[Studio UI]
  Aria -->|generate_tryon tool| TryOn[tryon_service]
  Studio --> TryOn
  TryOn --> Runway[Runway gen4_image]
  Runway --> Supabase[Supabase hot CDN]
  TryOn --> GenblazeIngest[Genblaze Pipeline.ingest]
  GenblazeIngest --> B2[(Backblaze B2)]
  Studio --> Animate[/api/tryon/animate]
  Animate --> GenblazeVid[Genblaze + RunwayProvider]
  GenblazeVid --> B2
  GenblazeVid --> Manifest[SHA-256 manifest]
```

---

## What changed during the hackathon window

Existing StyleSense (Runway try-on + Aria agent) was extended **after June 22, 2026**:

- Added `genblaze-core`, `genblaze-s3`, `genblaze-runway` dependencies
- New `genblaze_media_service.py` (B2 sink, ingest, animate pipeline)
- Wired try-on + animate paths to archive/orchestrate via Genblaze when B2 env is set
- Documented live URLs and setup in README + this file

---

## Devpost submission checklist

### Working app URL

**https://style-sense-beryl.vercel.app**

### Test account (for judges)

| Field | Value |
|-------|--------|
| Email | *(seed account — provide in Devpost private testing notes)* |
| Password | *(provided in Devpost “Testing instructions” — not in public README)* |
| Flow | Login → **Studio** (try-on) or **Aria** (agentic stylist) |

**Testing instructions (paste into Devpost):**

1. Open the app URL → **Log in** with the test account above.
2. **Wardrobe** — confirm items load (~40+ pieces).
3. **Aria** (`/stylist`) — ask: *“Rooftop cocktail party — pick 2 items from my wardrobe.”*  
   Expect wardrobe-specific reply with item chips.
4. **Studio** — select items → **Manifest this look** (try-on).  
5. **Animate** — generate a short runway video from the try-on still.  
6. *(With B2 configured on backend)* outputs are archived to B2 with Genblaze manifests (see backend logs / PostHog `media_provenance_archived`).

### GitHub repo

Public: `https://github.com/ihddirmas/StyleSense`  
Private repos: grant **https://github.com/b2genblaze** collaborator access.

### Demo video (~3 min) — suggested script

| Time | Shot |
|------|------|
| 0:00–0:20 | Problem: buying clothes blind; show landing page |
| 0:20–0:45 | Wardrobe + selfie onboarding |
| 0:45–1:30 | **Aria USP**: occasion prompt → item picks → optional pending try-on card |
| 1:30–2:15 | Studio try-on + event scene + animate video |
| 2:15–2:45 | Mention **Genblaze** pipeline + **B2** durable storage / provenance hash |
| 2:45–3:00 | Live URL + “production-minded” (auth, caps, deploy) |

Upload to YouTube/Vimeo and link on Devpost.

### Providers & models (short list for form)

Runway gen4_image, veo3.1; Anthropic Claude Sonnet/Haiku; Genblaze orchestration; Backblaze B2 storage.

### B2 + Genblaze explanation (short paragraph for form)

StyleSense uses **Genblaze** to run Runway image-to-video generation inside a `Pipeline` with a B2 `ObjectStorageSink`, producing verifiable manifests for each animate run. Try-on stills are **ingested** into B2 via `Pipeline.ingest` after Runway generation, preserving SHA-256 provenance and durable URLs. Supabase remains the low-latency CDN for the app; B2 is the long-term media archive.

### Optional: Genblaze feedback issue

File at [github.com/backblaze-labs/genblaze/issues](https://github.com/backblaze-labs/genblaze/issues) — e.g. first-class `gen4_image` try-on modality adapter to chain try-on → animate in one `chain=True` pipeline.

---

## Local setup (B2 + Genblaze)

```bash
# 1. Create B2 bucket (10 GB free): https://www.backblaze.com/cloud-storage
# 2. Application key with read/write on bucket

cd backend
cp .env.example .env
# Set B2_BUCKET, B2_KEY_ID, B2_APP_KEY, RUNWAYML_API_SECRET, ANTHROPIC_API_KEY, ...

./venv/bin/pip install -r requirements.txt
./venv/bin/python -m scripts.test_genblaze_smoke   # ingest smoke (no credits)
# Optional animate smoke (~60 credits):
# GENBLAZE_SMOKE_IMAGE_URL=https://...public.jpg GENBLAZE_SMOKE_ANIMATE=1 \
#   ./venv/bin/python -m scripts.test_genblaze_smoke
```

---

## Links

- [Genblaze repo](https://github.com/backblaze-labs/genblaze) ⭐
- [Genblaze developer guide](https://www.backblaze.com/docs/cloud-storage-genblaze-developer-guide)
- [Runway connector](https://github.com/backblaze-labs/genblaze/tree/main/libs/connectors/runway)
