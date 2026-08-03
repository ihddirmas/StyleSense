# Gen Media final push — 5h ADHD battle plan

**Deadline:** Aug 3, 2026 · 5:00pm EDT  
**Goal:** Deserving 3rd+ place · no guilt about basics left undone  
**Judging (only these matter):** Real-world utility · Production readiness · **B2 orchestration** · **Genblaze use**

---

## Kill list (do NOT open these tabs)

| Temptation | Why kill |
|------------|----------|
| 100 SEO pages | Zero judge weight tonight |
| Full rebrand → StyleSenseAI / domain hunt | Distraction; keep StyleSense |
| Rename Aria site-wide | Brand ok as-is for demo |
| Full mobile pass every page | Spot-check Studio + Stylist only |
| Full a11y audit | Skip |
| Automate Vercel preview testing | Skip |
| Deep Speed Insights chase | Landing is already Great (90); app routes OK for demo |
| Folder archaeology / gtm-context rabbit holes | Skip |
| “Connect every MCP” | Only if blocked |

**Standing rule:** if a tab isn’t on the 30-min schedule, close it.

---

## Model routing (Claude vs DeepSeek)

| Work | Use |
|------|-----|
| Devpost copy, demo script, judge narrative | **Claude** (quality writing) |
| Agentic stylist logic, LangGraph, tools | **Claude** |
| Mechanical refactors, grep/fix, README polish | **DeepSeek** (save Claude) |
| Long “what if we rebuild…” chats | **Neither** — stick to schedule |

Claude session is nearly full (~3% used, resets ~3.5h). Save Claude for copy + agent bugs.

---

## Body / ADHD cadence

Every **25 min work + 5 min stand/walk/water** (phone away).  
Every **90 min**: 10 min away from chair (stretch hips/back).  
One browser window · one checklist tab · no social until Devpost Submit is clicked.

---

## 30-minute blocks (follow in order)

### Block 0 — NOW / already done by agent
- [x] Fix prod DB (`db_ok: true`, B2 + Genblaze live)
- [x] Devpost draft: `docs/hackathons/DEVPOST_SUBMISSION_DRAFT.md`
- [x] Agentic Aria: `search_wardrobe` + `save_outfit` tools
- [x] Fix double `AuthProvider` (perf)
- [x] StyleSense favicon (replace Vercel triangle)
- [x] Soften Studio “Proof video” consumer copy (provenance stays)

### Block 1 — Submit skeleton (you, 25 min)
1. Open Devpost → create/edit project.  
2. Paste **name, pitch, About, Built with, links, providers, B2/Genblaze** from the draft.  
3. Leave video + gallery empty for now.  
4. **Save draft** (not final submit yet).  
5. Stand 5 min.

### Block 2 — Judge path dry-run (25 min)
1. Incognito → login with **seed/TEST account** (not signup).  
2. `/stylist`: paste a product URL → Suits/Borderline/Avoid.  
3. Ask for an outfit → confirm try-on if offered.  
4. `/studio`: try-on → confirm B2 toast / provenance chip.  
5. Animate once if credits allow (or use existing video).  
6. Note any break → fix only blockers.  
7. Stand 5 min.

### Block 3 — Demo video (25–40 min) ★ prize-critical
1. Loom/OBS · 3 min · script in `BACKBLAZE_GEN_MEDIA_2026.md`.  
2. Must show Genblaze→B2, not only pretty try-on.  
3. Upload to YouTube/Streamable → paste Devpost video field.  
4. Stand 5 min.

### Block 4 — Gallery + thumbnail (25 min)
1. Capture 6–8 screens (3:2 crop).  
2. Thumbnail = best Aria+Studio frame.  
3. Upload gallery.  
4. Stand 5 min.

### Block 5 — Presentability pass (25 min)
1. Favicon visible in browser tab (hard refresh).  
2. Landing loads; login works; stylist + studio OK on your phone once.  
3. README already points at Gen Media doc — skim for broken links.  
4. Stand 5 min.

### Block 6 — Final submit + social (25 min)
1. Re-check App URL + GitHub + b2genblaze access if private.  
2. `GET /health` → `db_ok` + `b2_configured`.  
3. **Submit** on Devpost.  
4. Only then: one social post with live URL.  
5. Stop coding. Protect sleep.

### Buffer (if early)
- One agentic polish only if demo revealed a gap.  
- Else: practice the 60-second verbal pitch once.

---

## Guilt-free “done” definition

You are done when:

1. Devpost is **submitted** with working app + repo + B2/Genblaze writeup + demo video.  
2. Judge can log in and see Aria + try-on + B2 provenance without your help.  
3. You did **not** burn hours on SEO/rebrand/perf rabbit holes.

That is a deserving submission.
