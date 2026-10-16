# YouCam API Skin AI & eCommerce VTO Hackathon — win strategy

> **Devpost:** [youcam-api-skin-ai-ecommerce.devpost.com](https://youcam-api-skin-ai-ecommerce.devpost.com/)  
> **Deadline:** Nov 2, 2026 @ 11:45am EST  
> **Prizes:** $2,500 / $1,000 / $500 + Women in Tech $1,000 + Rising Star (student) $1,000  
> **Prior gallery (ended):** [youcam-api.devpost.com/project-gallery](https://youcam-api.devpost.com/project-gallery)  
> **Prior StyleSense plan:** [YOUCAM_2026.md](./YOUCAM_2026.md) (Aug 2026 contest — still useful for API wiring)

---

## What actually won last time

| Place | Project | Win move |
|-------|---------|----------|
| 1st | **Aloud Beauty** | Accessibility inversion — Skin Analysis for blind shoppers, screen-off, agentic tools, honesty/bias disclosure. Not “pretty skin scores.” |
| 2nd | **ShadeSpan** | Funnel inversion — Apparel VTO as a *brand catalogue instrument* across Fitzpatrick tones + color science grades. Worst-tone scoring, not average. |
| Top | **CASTING** | Same brand-side coverage idea with **four** load-bearing YouCam APIs + measured language + honest panel limits. |

### Patterns that beat “AI stylist + try-on”

1. **Invert the obvious consumer demo** — brand audit, accessibility, trust/proof — not another “see yourself in this dress.”
2. **One sharp problem with retail evidence** — ADA lawsuits, return rates, catalogue bias — named in the writeup.
3. **Measurement > vibes** — ΔE, Fitzpatrick, ui_scores, confidence disclosure. Judges reward math and honesty.
4. **Multiple YouCam APIs that each earn their keep** — not one call behind a pretty UI.
5. **Agentic / tool-using flows** (Aloud; new brief explicitly asks for this).
6. **Complete product + ruthless 1–3 min demo** — judges need not watch past 3 minutes.

### What lost (same gallery)

Wearwise, Atelier, ClosetIQ, Drape, MirrorFit — competent “analyze → recommend → try on” wrappers. Close to StyleSense’s default pitch. **That pitch alone will not win.**

---

## New contest emphasis (vs Aug)

- Topics: **Skin AI** *or* **eCommerce VTO** (combined still strongest).
- Explicit ask for **Agentic AI workflows** and **not surface-level wrappers**.
- Same submission shape: repo + description + screenshots + **1–3 min** YouTube/Vimeo demo naming YouCam APIs used.
- Judging: Technological Implementation · Design · Potential Impact · Quality of Idea.

---

## StyleSense win wedge (recommended)

**Name the idea:** *Measured look approval* — “Does this color actually show up on *my* skin — and should I wear/buy it?”

**Not competing with:**
- Aloud → accessibility / screen-off (don’t copy)
- ShadeSpan / CASTING → brand merchandising audit (don’t copy)

**Do ship (consumer, closet-first, Aria-agentic):**

1. **YouCam Skin AI** on the primary selfie → concern scores + tone hexes + Fitzpatrick (already partially wired).
2. **Contrast / washout grade** for a garment or try-on against the user’s measured skin (consumer shade of ShadeSpan’s maths — one face, not a brand panel).
3. **YouCam Apparel VTO** as the Studio engine judges see labeled (already planned / partially wired).
4. **Aria as the agent** — tools that: pull skin profile, score a wardrobe item or shop URL, trigger YouCam try-on, return a verdict with confidence / “we don’t know” honesty (Aloud’s discipline).
5. **Closet-first moment** — grade what you already own before shopping (matches StyleSense pivot; avoids “another shop VTO”).

One-line for judges: *One selfie. YouCam measures your skin. Aria grades every look against those measurements — then YouCam shows the try-on.*

### Demo script (≤ 3 min)

1. Seeded account → Skin report (YouCam-measured swatches + concerns).  
2. Wardrobe item that *fails* contrast → Aria says so with numbers.  
3. Item that *passes* → YouCam VTO in Studio, provider labeled.  
4. Shop URL → Aria tool: scrape → score → try-on → buy/skip.  
5. Narrate APIs by name on screen.

### Submission checklist

- [ ] Register + redeem 1,000 YouCam units (account owner)
- [ ] Repo public or shared with `contact_event@PerfectCorp.com`
- [ ] Description: consumer value + which YouCam APIs + why not a wrapper
- [ ] Screenshots: skin report, contrast fail/pass, Aria tool call, YouCam VTO
- [ ] 1–3 min video on YouTube (name APIs; show working product)
- [ ] Exit interview / blog consent if placed

---

## Build priority (vs wrapper risk)

| Priority | Work | Why |
|----------|------|-----|
| P0 | Skin score → garment contrast grade UI + Aria tool | Quality of Idea + Impact (ShadeSpan lesson, consumer-side) |
| P0 | YouCam VTO labeled in Studio demo path | Technological Implementation judges can see |
| P1 | Aria agent loop that *must* call YouCam-backed tools for verdicts | Agentic ask in new brief |
| P1 | Honesty copy (confidence, lighting, “unknown”) | Aloud lesson |
| P2 | Merchant/catalogue mode | Only if P0 solid — CASTING already owns brand board |
| Avoid | “Personal stylist with try-on” as the headline | Lost last time |

---

## Existing code to reuse

- `backend/services/youcam_service.py` — tone, Fitzpatrick, skin concerns, face shape, apparel try-on, bg removal
- Settings / stylist analysis UI already surfaces YouCam-measured fields
- Aria tools + wardrobe/scrape pipeline for the agentic shopping loop
- Prior plan details in `YOUCAM_2026.md`
