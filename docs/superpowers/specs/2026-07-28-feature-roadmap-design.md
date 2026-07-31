# Feature roadmap: high-ROI scope narrowing (2026-07-28)

## Context

`feature/dashboard-retention-ux` shipped its core retention loop (usage meter, continue card, Studio preselection, PostHog A/B test). Before merging, the product owner wants two things: (1) a redundancy/dead-code audit (done separately — 12 of 60 backend endpoints have zero callers and cluster into 4 superseded subsystems, see conversation history for the exact list), and (2) a forward roadmap across five raised ideas, decomposed into independently workable tracks with sequencing and the open decisions each one depends on.

This doc captures the roadmap and the decisions already locked in during brainstorming, so each track can move to its own spec/implementation cycle without re-litigating scope.

## Track map and dependencies

```
Track A: Cutout quality fix        (independent, already in flight — separate session/worktree)
Track B: Aria → agent-focused chat (independent)
Track C: Scrape improvements       (independent; social-feed idea under this track is DEFERRED)
Track D: Color grounding + Kibbe   (independent)
Hero video replumb                 (depends on Track B's outcome)
Track E: B2C photography pipeline  (PARKED — not scoped until Track A matures)
```

Tracks A/B/C/D touch almost entirely disjoint files (`garment_cleaner.py`+`wardrobe.py` / `stylist.py`+`aria_graph.py` / `chat.py`+`friends.py`+`scrape.py` / `color_service.py`), so they're safe to run in parallel across separate sessions or worktrees.

## Track A — Cutout quality (in flight, separate session)

Verified findings: the `cutout_url` architecture (transparent PNG for display, opaque `image_url` kept for Runway try-on input) is sound and already fully wired in the schema/frontend types. It was built once, shipped, and reverted (`cfa6141` → `ba3c0b4`) because the rembg output "looked bad" — likely edge artifacts — and that root cause was never diagnosed. `experiment/transparent-cutouts` just flips the same never-fixed code back on without addressing the quality problem, and has merge conflicts against 3 frontend files touched by 16+ commits of UI work since it branched.

**Decision:** do not merge the experiment branch as-is. Running in a separate session on different ports to diagnose and fix `garment_cleaner.py`'s `make_cutout()` (rembg edge quality — feathering/matting, per-category model selection) from scratch, then re-enable the existing `cutout_url` plumbing.

## Track B — Aria: soft-deprecate video, build agent-focused text chat

**Decision: soft-deprecate the voice/video avatar.** Leave `AvatarWidget.tsx`, the Runway Custom Character resource, and `avatar.py`'s character endpoints in place, but stop featuring the voice tab in the UI and stop actively using the character session. This preserves the option to revive it later at zero rebuild cost.

Verified: text chat (`stylist.py` → `aria_graph.py` → Claude) and the voice avatar (Runway WebRTC + Custom Character) share no code dependency in either direction — this separation costs nothing extra.

**Memory:** the scaffolding already exists and is fully unwired — `stylist_sessions` table, full CRUD API (`GET/POST/PUT/DELETE /api/stylist/sessions*`), and a Zustand store (`ariaChat.ts`) shaped for it, but `stylist/page.tsx` never calls `createSession`/`updateSession`/`setCurrentSession`. Adding real session persistence is primarily wiring the existing store methods into the chat UI's send flow — not new backend work.

**Chat-based wardrobe upload — decision: auto-detect then confirm.** When a user drops a photo in chat, the bot runs detection immediately and asks for confirmation in-chat before inserting ("I see a blue jacket — add it?"), rather than silently auto-adding. This avoids surprise Runway-credit spend and gives a correction point before a bad detection lands in the wardrobe.

Concretely new work required (verified, not assumed): `aria_graph.py` has no tool-calling today (no `tools=[...]` param on any Claude call anywhere in the codebase) — there's no existing mechanism for the model to decide mid-conversation to invoke the wardrobe pipeline. The underlying services are reusable as-is: `wardrobe_vision_service.detect_items_from_bytes()` for structured multi-item detection and `garment_cleaner.runway_isolate_item()` for isolation are exactly what `wardrobe.py`'s existing upload flow already uses — the new work is the intent-routing/confirmation layer connecting chat to that pipeline, plus extending `StylistChatRequest`'s schema (today `image_url` is a single top-level field, not per-message) to carry a photo alongside a "this is a wardrobe add" signal.

## Track C — Scrape improvements (social feature deferred)

**Decision: defer the social/retention feature entirely.** Zero notification/feed/reaction infrastructure exists anywhere in the schema — building any of it (activity notifications, a feed) would be from-scratch work. Not worth it right now; retention effort stays on the already-shipped usage meter/continue card.

Note for later, if revisited: the friends/chat compose UI is *already* share-only (no free-text box exists in the frontend) — nothing needs restricting there. But the underlying `messages` table is a generic bidirectional DM schema with Realtime wired to it, and sharing runs through that same table/channel — so there's no way to cut chat infrastructure cost by "removing messaging" later; sharing depends on the identical pipe. There's also a dead, unused `friends/share` + `friends/shares` stub pair (canned responses, nothing persisted) that should be deleted regardless of what else happens here.

**Scrape improvements (active scope):** current implementation is static-HTML-only (`httpx` + BeautifulSoup, no headless browser), extracts only image URL + title + a coarse 6-bucket category guess (no color/brand/price/material), and has zero retry/backoff logic — Amazon/H&M/Zara are known-blocked today with a manual "paste image URL" workaround as the only fallback. Improvement work here should focus on: richer extraction where pages do cooperate (color/brand from available metadata), better/specific error messaging per failure mode (timeout vs. 403 vs. no `og:image` vs. malformed HTML currently funnel into similar generic text), and retry/backoff on transient failures. Adding a headless-browser fallback (Playwright) for JS-heavy sites is explicitly out of scope for now — it's a much larger infra cost (browser binary, memory, cold start) on a small deployment, and the existing "paste image URL" workaround already covers the sites that are hard-blocked (Amazon) regardless.

## Track D — Color grounding + Kibbe

Kibbe body-shape analysis is confirmed 100% absent — the existing 5-type system (`rectangle`/`hourglass`/`pear`/`inverted_triangle`/`apple`, sourced from "the concept wardrobe") is a different, simpler model, not Kibbe's 13-type system. This is net-new framework work: new type taxonomy, new knowledge-base content, new classification prompt.

Seasonal color analysis has real supporting infrastructure (caching keyed to source photo, invalidation on photo change, a citation-sourced knowledge base consumed downstream) — but the actual season/undertone *determination* is a single ungrounded Claude vision call with no color-theory grounding (no structured intermediate reasoning about skin/hair/eye traits before the label, no reference-palette comparison). Kibbe would inherit the same shallow-classification risk if built the same way, and worse — 13 classes with subtler distinctions (bone structure, flesh distribution) than 4 seasons.

**Recommendation carried into this track (not yet a locked decision — flag before implementation):** solve the grounding problem once, for both. Add a structured intermediate step to the vision prompt (ask Claude to reason about specific observable traits first — shoulder/hip ratio, bone width, vertical vs. horizontal lines for Kibbe; visible skin/hair/eye tone description for color — before emitting the final label) rather than a single opaque classification call for either. Building Kibbe with the same shallow pattern seasonal color has today would just double the ungrounded-classification risk instead of fixing it.

## Track E — B2C product photography pipeline: PARKED

**Decision: too early to decide.** Not scoped until Track A's cutout-quality work is done and its actual capability is visible. When revisited, the open question is whether this targets StyleSense's existing consumer base (resale photography, direct extension of Track A's isolation tech) or a separate seller/business-facing service (different customer, metered pricing, larger pivot) — don't commit to either until then.

## What's NOT in this roadmap

- Backblaze/B2 storage work — explicitly out of scope per earlier decision, tracked separately.
- The 12 dead backend endpoints — a separate, already-scoped cleanup (delete candidates identified, not yet executed).
