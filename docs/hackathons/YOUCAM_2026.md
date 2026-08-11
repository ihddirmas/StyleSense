# YouCam API Skin AI & Apparel VTO Hackathon — placement strategy

> **Goal:** Win (1st = $5,000) or place top 5 (API units)
> **Deadline:** Aug 17, 2026, 9:15pm IST (11:45am ET)
> **Devpost:** [youcam-api.devpost.com](https://youcam-api.devpost.com/)
> **Track:** Skin AI + Apparel VTO (combined)

---

## Why the combined track, and why StyleSense fits it

The rules explicitly call out the combined track as the hardest to do well:
*"Beauty and fashion decisions rarely happen in isolation... build something
that brings Skin AI and Apparel VTO together into one experience, rather than
treating them as two separate features."* Most entrants will ship one track;
few will genuinely connect both.

StyleSense already has the connective tissue: **Aria**, an AI stylist with
wardrobe knowledge and a system prompt. The plan is not "add a skin analysis
page" next to "add a try-on page" — it's: run YouCam skin-tone analysis on
the user's selfie (skin/hair/eye/lip hex colors), and feed those colors into
Aria's context alongside her existing color-season profile so her outfit
advice becomes tone-aware. Apparel VTO becomes a primary try-on engine
option in Studio, so the whole flow runs on the YouCam API being judged, not
a bolted-on demo.

| Criterion | Our edge | Risk |
|---|---|---|
| **Technological Implementation** | Real async task+poll integration for both APIs, cross-verified against real production code (see below), existing production auth/DB/multi-user infra already in place | First live call is still the real confirmation — code hasn't executed against the actual API yet |
| **Design** | Full existing product (wardrobe, dashboard, Aria chat) — not a bare API demo | Must ship a coherent Skin Report UI, not just raw JSON |
| **Potential Impact** | Concrete framing already matches the hackathon's own pitch: "replace the guess with something closer to certainty" | Demo must land the specific skin+outfit connection, not just show two features side by side |
| **Quality of Idea** | Tone-aware Aria advice is the actual differentiator — few teams will connect the two APIs through a conversational agent | Only scores if Aria visibly *uses* the tone data, not just displays it |

---

## Architecture

- `backend/services/youcam_service.py` — auth, `youcam_apparel_tryon()`, `youcam_skin_tone_analysis()`. Mirrors `runway_service.py`'s shape.
- `backend/supabase_schema_v2n_skin_analysis.sql` — `users.skin_analysis_result` (JSONB), `_status`, `_source_selfie`, `_updated_at`.
- `backend/routers/skin.py` — `POST /api/skin/analyze`, `GET /api/skin/status`.
- `backend/routers/tryon.py` — `POST /api/tryon/generate` takes `model: "youcam"` as an additional engine alongside Runway's models (Runway path untouched — zero regression risk).
- Aria (`graphs/aria_graph.py`) — system prompt gains a `# SKIN ANALYSIS` block, formatted by `youcam_service.format_skin_profile()`, synced the same way color/Kibbe profiles already are.
- Frontend: new Skin Report card (hex swatches), Studio gains a `youcam` option in the try-on model picker (`lib/models.ts`).

## Required env vars (`backend/.env`)

```
YOUCAM_API_KEY=    # API Key from yce.perfectcorp.com/ai-api account dashboard
```

**Blocked on:** account signup (yce.perfectcorp.com/ai-api) + redeem code claim (1,000 free API units) — only the account owner can do this.

### `perfectcorp.com` outage (2026-08-06/07)

`docs.perfectcorp.com` and `yce.perfectcorp.com` (marketing/signup/docs) were unreachable —
`ERR_CONNECTION_TIMED_OUT` from multiple independent networks (home, mobile, and a US-based
sandbox), 100% ICMP packet loss to the resolved IP. **This does not affect the actual API**:
`yce-api-01.makeupar.com` (the real API host, on separate AWS Global Accelerator infrastructure)
resolves and responds fine. Workaround: VPN to a different region and retry the signup URL — this
looks like a partial/regional CDN issue specific to the docs+marketing domain, not a full outage.

### API contract confidence

Official docs were never reachable for this project, so the request/response shapes below are
**cross-verified from three independent real, working, open-source integrations** rather than
guessed — most importantly a recent, complete production client:

1. [**Cyberman-HZ/LoopLook**](https://github.com/Cyberman-HZ/LoopLook) — `lib/youcam.ts`, the
   primary source below. Complete, current (uses `cloth-v3`, not the older `cloth`), includes real
   provider error codes.
2. [swallace100/Virtual-Try-On-AI-Store-Mirror](https://github.com/swallace100/Virtual-Try-On-AI-Store-Mirror) — apparel VTO on the older `cloth` task variant; corroborates auth + base URL.
3. [nakamura196/zenn-youcam](https://github.com/nakamura196/zenn-youcam) — 20-task survey; corroborates the file-upload flow's shape.

Confirmed across all three: `Authorization: Bearer <API key>` (no RSA signing, no token exchange),
base URL `https://yce-api-01.makeupar.com/s2s/v2.0/`, response envelope `{status, data: {task_id,
task_status, results}, error}`, and polling keeps the task-type slug in the URL
(`/task/cloth-v3/{task_id}`, not `/task/{task_id}`).

**Note the pivot**: originally planned around a wrinkle/pore/acne concern-score "skin-analysis"
endpoint that only had a single, less-authoritative source. Switched to `skin-tone-analysis`
(skin/hair/eye/lip hex colors) once LoopLook's real, current, production code confirmed it —
better evidence, and it's a more direct fit for StyleSense anyway (feeds the same "what colors
flatter you" reasoning `color_service.py` already does for Aria, rather than reading like a
dermatology report bolted onto a wardrobe app).

Real provider error codes now mapped to friendly messages in `youcam_service.py`
(`error_pose`, `error_invalid_src`, `error_face_position_invalid`, `exceed_max_filesize`
[10MB cap], `error_nsfw_content_detected`, etc.) — use these for error UI instead of a generic
"request failed."

---

## Judge demo flow (target: under 3 minutes)

1. **Login** with test account (wardrobe + selfie pre-seeded).
2. **Settings/Onboarding** — trigger skin-tone analysis from the primary selfie → Skin Report card renders (hex swatches).
3. **Aria** (`/stylist`) — ask for outfit advice → response references a real detected tone, not generic styling talk.
4. **Studio** — select an item → **Generate try-on** with the YouCam engine selected → result comes back via YouCam Apparel VTO (label it in the UI so judges see which provider ran).
5. Narrate in the video: "one selfie, two YouCam APIs, one connected recommendation."

---

## Submission checklist

- [ ] Repo public (already true: `github.com/ihddirmas/StyleSense`) — no need to share with `contact_event@PerfectCorp.com`
- [ ] Text description: features, functionality, **explicit consumer/retail value** statement
- [ ] Screenshots: Skin Report, Aria tone-aware response, Studio try-on result
- [ ] 1–3 min demo video: explains the YouCam API(s) used, shows on-device footage, uploaded publicly to YouTube
- [ ] Explain in the submission how the project was "significantly updated" during the Submission Period (Jul 6 – Aug 17, 2026) — the YouCam integration itself is the update
- [ ] Submitted before Aug 17, 2026, 9:15pm IST
