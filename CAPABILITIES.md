# CAPABILITIES.md

Every public capability claim, and the source that implements it.

**The rule:** marketing copy — README, landing page, Devpost, deck, social — may only
claim something listed as **Shipped** below. If a claim isn't here, it doesn't ship in
copy. If you build something new, add the row in the same PR.

This file exists because it was not in place before: on 2026-08-17 the README still
advertised a WebRTC voice avatar that was deleted on 2026-08-07, and a Runway Knowledge
Base sync with zero references anywhere in the codebase.

Last audited against source: **2026-08-17**.

---

## Shipped — safe to claim

| Claim | Implemented by | Notes |
|---|---|---|
| Virtual try-on, choice of engine | `services/runway_service.py` (`TRYON_MODELS`), `routers/tryon.py` | Default `gen4_image`; `gemini_2.5_flash` and `gen4_image_turbo` also available |
| Garment-specialised try-on (YouCam cloth-v3) | `services/youcam_service.py::youcam_apparel_tryon` | Selectable model, not the default |
| Event scene placement | `routers/tryon.py` (event-scene) | `gen4_image` |
| Runway-walk video | `services/runway_service.py` (`VIDEO_MODELS`) | **`veo3.1`** default, `gen4_turbo` fallback. **Not gen4.5** — that is not in the allowlist |
| Seasonal colour analysis | `services/color_service.py` | Claude vision; cached on `users.color_profile` |
| Kibbe body-type analysis | `services/kibbe_service.py`, `data/kibbe_knowledge.json` | Needs a full-body photo |
| Measured face shape | `services/youcam_service.py::youcam_face_shape_analysis` | Badged "measured" in UI only when `face_shape_source == youcam_measured` |
| Fitzpatrick skin typing | `services/youcam_service.py::youcam_fitzpatrick_analysis` | |
| Photo-lighting normalisation | `services/youcam_service.py::youcam_photo_lighting` | Runs before colour analysis |
| Background removal | `services/youcam_service.py::youcam_background_removal`, `services/garment_cleaner.py` | rembg is the local fallback |
| Suitability verdicts (colour + silhouette) | `services/suitability_service.py`, `POST /api/stylist/verdict` | Deterministic, no LLM call, no credits |
| Agentic stylist with tool calling | `graphs/aria_graph.py`, `services/aria_tools.py` | Confirm-gated via `pending_action` |
| Preference memory | `services/aria_memory_service.py` | Stored and injected into prompt context. **Do not claim it re-ranks recommendations** — see Not shipped |
| Trip capsule planning | `services/capsule_service.py` | Reachable as an Aria tool call |
| Multi-item wardrobe detection | `services/wardrobe_vision_service.py` | Claude vision; review checklist before adding |
| Product URL scraping | `routers/scrape.py` | Large retailers block scraping; direct image URLs work |
| Analysis status + retry | `color_analysis_status` / `kibbe_analysis_status` / `skin_analysis_status`, `POST /api/avatar/retry-analysis` | Failures surface a retry instead of an empty page |
| Social loop | `routers/friends.py`, `routers/chat.py` | Friends, threads, Realtime chat, share outfit/try-on. Behind `FEATURES.social` |
| Durable media archive | Genblaze + Backblaze B2 | SHA-256 provenance manifests. Behind `HACKATHON_MODE` |
| Usage caps | `services/usage_limits.py` | Enforced. **Everyone is on the Free cap** — see Not shipped |

## Not shipped — must not appear in copy

| Claim | Status | Detail |
|---|---|---|
| Voice avatar / live Aria session / WebRTC | **Deleted 2026-08-07** | `AvatarWidget.tsx` and `POST /api/avatar/connect` are gone. `character_service.py` now only provisions Aria's static portrait. All Aria interaction is text chat. Do not rebuild or reference it |
| Runway Knowledge Base wardrobe sync | **Never shipped / removed** | Zero references in the codebase. Aria knows the wardrobe via prompt context in `aria_graph`, not a Runway KB |
| Weather-aware recommendations | **Never built** | No weather integration anywhere in `backend/`. The only mention is a string in an Aria tool description |
| `gen4.5` as the video model | **Inaccurate** | Video allowlist is `{veo3.1, veo3.1_fast, gen4_turbo}`. Claim `veo3.1` instead |
| Paid tiers (Plus / Studio) | **Not enforceable** | No billing, no `plan` column. `usage_limits.py` applies the Free cap to every user. Pricing may collect *intent* only until Stripe exists |
| Memory that learns and re-ranks | **Partial** | Memory is stored and prompt-injected, but nothing scores candidates against it. Claim "remembers what you tell it", not "learns what to recommend" |
| Proactive / autonomous styling | **Not built** | No scheduler of any kind. `email_service.send` has exactly one caller (a usage-cap notice) |
| Daily outfit suggestions | **Not built** | Requires the scheduler above |
| Recommendations powered by Gemini | **Wrong subsystem** | Gemini renders *pixels* (`gemini_2.5_flash`). All reasoning is Claude (`claude-haiku-4-5`) |

## Claims needing care

- **"Reduces returns"** — the thesis behind the product, but nothing instruments it yet.
  Frame as the problem being addressed, not as a measured outcome.
- **"Tested across body types"** — the fixture set genuinely is diverse, but no automated
  assertion scores body-proportion fidelity. Do not claim testing until the rubric exists.
- **Star ratings / `aggregateRating` schema** — do not emit without genuinely collected
  ratings. It is a manual-action risk and it is untrue.
