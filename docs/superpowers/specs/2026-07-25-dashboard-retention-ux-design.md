# Dashboard Retention UX — Usage Meter + Continue Card

## Context

Free-tier usage caps (5 try-ons / 3 event-scenes / 1 animate per month) already exist
end-to-end (`backend/services/usage_limits.py`, `aurora_schema.sql`'s `usage_events`
table), enforced reactively via a 402 when a user hits the cap mid-action. There is
currently no proactive surfacing of usage on the Dashboard, and no personalized nudge
back into an unfinished activity (e.g. a wardrobe item added but never tried on).

This spec covers two small, additive Dashboard features:

1. **Usage meter** — shows try-on usage progress ("3 of 5 this month") before the user
   hits the cap.
2. **Continue card** — nudges the user back to the most recently added wardrobe item
   that has no try-on yet, deep-linking into Studio with it preselected.

## Goals

- Give users visibility into their free-tier try-on usage before they hit a hard stop.
- Give returning users with an unfinished wardrobe item a one-click path back into Studio.
- Ship with minimal new backend surface, reusing data the Dashboard already fetches.

## Non-goals

- Surfacing event-scene/animate caps on the dashboard (already reactively surfaced via
  the 402 error flow elsewhere; a dashboard meter for all three adds visual noise for
  caps most users won't reach first).
- Any new schema or tracking infrastructure for "in-progress activity" — the Continue
  card only uses data already in `wardrobe_items` / `try_on_results`.
- Backend-side computation of the "continue item" (see Approach below).

## Approach

**Chosen: client-side derivation.**

- One new backend endpoint for the usage meter (`GET /api/tryon/usage-status`), since
  usage counts genuinely don't exist client-side today.
- No new endpoint for the Continue card. `frontend/app/dashboard/page.tsx` already
  fetches `items: WardrobeItem[]` (`/api/wardrobe`) and `recent: TryOnResult[]`
  (`/api/tryon/recent?all=true`) for the existing carousel. The "most recent wardrobe
  item with no try-on yet" is derived from these two arrays already in memory.

**Alternatives considered:**

- *Fully backend-computed* (`GET /api/dashboard/retention` returning both usage and the
  continue-item via a SQL `NOT IN` query): more correct at scale and reusable by future
  server-side nudges (e.g. email), but duplicates data the Dashboard fetches anyway and
  adds a new SQL path to test before commit. Rejected as over-scoped for what's needed
  now (YAGNI) — revisit if a second consumer of "continue item" logic appears.
- *Hybrid* (bundle usage + continue-item into one new endpoint): minimizes endpoint
  count but leaves the Dashboard fetching overlapping wardrobe/try-on data twice.
  Rejected for the same reason.

**Known limitation, mitigated:** the existing `/api/tryon/recent` endpoint defaults to
`limit=12` server-side. The Dashboard's fetch (`/api/tryon/recent?all=true`) doesn't
override this, so the client-side derivation could false-positive "no try-on yet" for
a wardrobe item that was in fact tried on, if the user has more than 12 total
generations. Mitigation: the Dashboard's fetch is changed to pass `limit=100`. Free-tier
users are capped at 5 try-ons/month, so 100 comfortably covers realistic history without
needing a dedicated endpoint.

## Design

### Backend — `GET /api/tryon/usage-status`

New route in `backend/routers/tryon.py`, alongside the existing `/recent` route:

```python
@router.get("/usage-status")
async def usage_status(user = Depends(current_user)):
    used = supabase_service.count_tryons_this_month(user["id"])
    return {"used": used, "limit": usage_limits.FREE_TRYON_MONTHLY_LIMIT}
```

Thin read-only wrapper around functions that already exist and are already tested
(`count_tryons_this_month`, `FREE_TRYON_MONTHLY_LIMIT`). No new service logic.

### Frontend — `UsageMeter` component

New file: `frontend/components/dashboard/UsageMeter.tsx`.

- Fetches `/api/tryon/usage-status` once on mount.
- Renders a thin horizontal progress bar (gold fill on `--surface2` track) + a label
  ("3 of 5 try-ons this month") in the existing EB Garamond / Luxe Architecture styling
  used elsewhere on the Dashboard (matches `StyleInsightCard`'s surface treatment).
- **Fails soft**: if the fetch errors, the component renders nothing. This is a
  nice-to-have stat, not critical path — it must never block or degrade the rest of the
  Dashboard.
- Placement: right column, below `StyleInsightCard`, above the `ActionCard` stack.

### Frontend — `ContinueCard` component

New file: `frontend/components/dashboard/ContinueCard.tsx`.

- Pure presentational component: `{ item: WardrobeItem }` prop, no fetching of its own.
- Renders "You added **{item.name}** — see it on you", the item's thumbnail
  (`item.image_url`), Swiss-bordered like the existing `ActionCard` in this file.
- Links to `/studio?item={item.id}`.
- Parent (`DashboardPage`) renders it conditionally — nothing to render when there's no
  qualifying item (new user with no wardrobe, or everything already tried on). No
  empty/placeholder state needed.

### Dashboard page changes (`frontend/app/dashboard/page.tsx`)

- Bump the recent-tryons fetch: `apiGet<TryOnResult[]>('/api/tryon/recent?all=true&limit=100')`.
- Derive the continue item. Only a `status === "done"` try-on counts as "tried" — a
  failed or still-processing generation means the user hasn't actually seen the item on
  themselves yet, so it shouldn't suppress the nudge:
  ```ts
  const triedItemIds = new Set(
    recent.filter(r => r.status === "done" && r.wardrobe_item_id).map(r => r.wardrobe_item_id)
  );
  const continueItem = [...items]
    .filter(i => !triedItemIds.has(i.id))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  ```
- Render `<ContinueCard item={continueItem} />` above the existing `ActionCard` stack,
  only when `continueItem` is defined.
- Render `<UsageMeter />` in the right column below `StyleInsightCard`.

### Studio page changes (`frontend/app/studio/page.tsx`)

Small addition to support the Continue card's deep link:

- On mount, read `item` from `useSearchParams()`.
- If present and it matches a loaded wardrobe item's `id`, call the existing
  `useAppStore` selection setter once to preselect it — mirrors the store-based
  selection pattern already used throughout this file (`selectedItemIds`).
- No new state management; reuses the existing Zustand store.

## Error Handling

- `UsageMeter` fetch failure → renders nothing (see above). No toast, no retry UI —
  this matches the bar for a secondary/decorative stat, not the existing pattern used
  for primary data fetches (`fetchError` state) on this same page.
- `ContinueCard` has no independent fetch/failure mode — it's derived from `items` and
  `recent`, which already have their own established error handling on this page
  (`fetchError` + Retry button).
- Studio's `?item=` handling: if the id doesn't match any loaded item (stale link, item
  deleted since), it's silently ignored — falls back to Studio's normal empty-selection
  state.

## Testing

- **Backend**: extend the existing `backend/tests/test_usage_scalability.py` pattern
  with a check that `GET /api/tryon/usage-status` returns the correct `{used, limit}`
  against seeded rows (reuses the disposable-test-user + cleanup approach already
  established in that file).
- **Frontend**: manual browser verification (per this session's established testing
  approach) — seed a test account's try-on count, confirm the meter reflects it;
  add a wardrobe item with no try-on, confirm the Continue card appears and correctly
  preselects the item in Studio via the `?item=` link.
- No new automated frontend tests planned — matches the existing coverage level for
  Dashboard page components (none currently have dedicated component tests).
