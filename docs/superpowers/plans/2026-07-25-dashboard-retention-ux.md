# Dashboard Retention UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a usage meter and a personalized "Continue" card to the StyleSense Dashboard so users see their free-tier try-on usage proactively and get a one-click nudge back to an unfinished wardrobe item.

**Architecture:** One new thin backend endpoint (`GET /api/tryon/usage-status`) wraps existing, already-tested usage-count logic. Two new presentational frontend components (`UsageMeter`, `ContinueCard`) render on the Dashboard; the "continue item" is derived client-side from data the Dashboard already fetches — no new endpoint for it. A small addition to the Studio page reads a `?item=` query param to preselect the item when arriving from the Continue card.

**Tech Stack:** FastAPI (backend), Next.js App Router + React + TypeScript + Zustand (frontend). No new dependencies.

## Global Constraints

- Backend: always use the venv (`backend/venv/Scripts/python.exe`), never global python/pip.
- Backend routes derive `user_id` from `Depends(current_user)` — never trust a user id in a request body or query param.
- No emojis in code or UI copy.
- No comments unless the WHY is non-obvious.
- Match the existing "Luxe Architecture" visual system: `surface` class, CSS vars (`--gold`, `--text`, `--text-muted`, `--text-dim`, `--border`, `--surface2`), `font-mono uppercase tracking-widest` for eyebrow labels, `font-display` for headings — see `frontend/components/dashboard/StyleInsightCard.tsx` as the reference pattern.
- The Dashboard's usage meter must fail soft (render nothing on fetch error) — this is a secondary stat, not a critical-path fetch.
- The Continue card only counts a try-on as "done" (`status === "done"`) when deciding whether a wardrobe item has been tried on — failed/pending generations don't suppress the nudge.

---

### Task 1: Backend — `GET /api/tryon/usage-status` endpoint

**Files:**
- Modify: `backend/routers/tryon.py` (add route after the existing `/recent` route, currently ending at line 287)
- Modify: `backend/tests/test_usage_scalability.py` (add a new check section before the `finally:` cleanup block, currently starting at line 166)

**Interfaces:**
- Consumes: `supabase_service.count_tryons_this_month(user_id: str) -> int` (existing), `usage_limits.FREE_TRYON_MONTHLY_LIMIT: int` (existing module constant)
- Produces: `GET /api/tryon/usage-status` → `{"used": int, "limit": int}`, consumed by Task 2's `UsageMeter` component

- [ ] **Step 1: Write the failing test**

Add this import to the top of `backend/tests/test_usage_scalability.py`, alongside the existing imports (after line 24, `from services import db, supabase_service, usage_limits`):

```python
from fastapi.testclient import TestClient

from main import app
from services.auth_service import current_user
```

Add this new section to `backend/tests/test_usage_scalability.py`, inside the `try:` block, immediately after the animate-cap check (after line 164, `check("check_animate_cap raises 402 at 1/1 used", e.status_code == 402)`, and before the `finally:` on line 166):

```python

        # ── 6. GET /api/tryon/usage-status ──
        app.dependency_overrides[current_user] = lambda: {"id": test_user_id}
        client = TestClient(app)
        try:
            resp = client.get("/api/tryon/usage-status")
            check("usage-status returns 200", resp.status_code == 200)
            body = resp.json()
            check(f"usage-status used == 5 (got {body.get('used')})", body.get("used") == 5)
            check(f"usage-status limit == 5 (got {body.get('limit')})", body.get("limit") == 5)
        finally:
            app.dependency_overrides.pop(current_user, None)
```

- [ ] **Step 2: Run test to verify it fails**

Run from `backend/`:
```
venv\Scripts\python.exe -m tests.test_usage_scalability
```
Expected: `[FAIL] usage-status returns 200` (404, since the route doesn't exist yet), plus the two dependent checks also failing. The 5 earlier check sections (tryon cap, event-scene cap, animate cap) should still pass — if any of those regress, stop and investigate before continuing.

- [ ] **Step 3: Write minimal implementation**

Add this route to `backend/routers/tryon.py`, after the existing `/recent` route (after line 286, `return supabase_service.get_recent_tryons(user["id"], limit, saved_only=not all)`):

```python


@router.get("/usage-status")
async def usage_status(user = Depends(current_user)):
    used = supabase_service.count_tryons_this_month(user["id"])
    return {"used": used, "limit": usage_limits.FREE_TRYON_MONTHLY_LIMIT}
```

This requires `usage_limits` to be importable as a module in `tryon.py`. Change the existing import on line 17 from:
```python
from services.usage_limits import check_tryon_cap, check_event_scene_cap, check_animate_cap
```
to:
```python
from services import usage_limits
from services.usage_limits import check_tryon_cap, check_event_scene_cap, check_animate_cap
```

- [ ] **Step 4: Run test to verify it passes**

Run from `backend/`:
```
venv\Scripts\python.exe -m tests.test_usage_scalability
```
Expected: `[PASS] SCALABILITY CHANGES VERIFIED.` with all checks, including the three new ones, showing `[OK]`.

- [ ] **Step 5: Restart the backend dev server**

The backend runs via `uvicorn main:app --port 8000` without `--reload` (confirmed earlier this session) — a fresh route addition will not be picked up by an already-running process. If a backend dev server is running, stop it and restart:
```
cd backend
venv\Scripts\python.exe -m uvicorn main:app --port 8000 --log-level warning
```

- [ ] **Step 6: Commit**

```bash
git add backend/routers/tryon.py backend/tests/test_usage_scalability.py
git commit -m "feat: add GET /api/tryon/usage-status endpoint"
```

---

### Task 2: Frontend — `UsageMeter` component

**Files:**
- Create: `frontend/components/dashboard/UsageMeter.tsx`
- Modify: `frontend/app/dashboard/page.tsx` (render the component)

**Interfaces:**
- Consumes: `GET /api/tryon/usage-status` (Task 1) via `apiGet<{ used: number; limit: number }>("/api/tryon/usage-status")`
- Produces: `export function UsageMeter()` — no props, self-contained. Rendered by `DashboardPage`.

- [ ] **Step 1: Create the component**

Create `frontend/components/dashboard/UsageMeter.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { Gauge } from "lucide-react";
import { apiGet } from "@/lib/api";

export function UsageMeter() {
  const [status, setStatus] = useState<{ used: number; limit: number } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    apiGet<{ used: number; limit: number }>("/api/tryon/usage-status")
      .then(setStatus)
      .catch(() => setFailed(true));
  }, []);

  if (failed || !status) return null;

  const pct = Math.min(100, Math.round((status.used / status.limit) * 100));

  return (
    <div className="surface p-4 md:p-5" style={{ borderColor: "var(--border-hover)" }}>
      <div className="flex items-center gap-2 mb-3">
        <Gauge size={13} style={{ color: "var(--gold)" }} />
        <span className="text-[9px] sm:text-[10px] font-mono uppercase tracking-widest" style={{ color: "var(--gold)" }}>
          Monthly Try-Ons
        </span>
      </div>
      <div className="text-xs sm:text-sm font-mono mb-2" style={{ color: "var(--text)" }}>
        {status.used} of {status.limit} used this month
      </div>
      <div style={{ height: 4, background: "var(--surface2)", borderRadius: 2, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: "var(--gold)",
            borderRadius: 2,
            transition: "width 300ms ease",
          }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the Dashboard**

In `frontend/app/dashboard/page.tsx`, add the import alongside the existing component imports (after line 6, `import { StyleInsightCard } from "@/components/dashboard/StyleInsightCard";`):

```tsx
import { UsageMeter } from "@/components/dashboard/UsageMeter";
```

Then render it below `StyleInsightCard`, inside the right-column `flex flex-col gap-3 md:gap-4` div (currently lines 139-146):

```tsx
          <div className="flex flex-col gap-3 md:gap-4">
            <StyleInsightCard insight={insight} items={items} recent={recent} />
            <UsageMeter />
            <div className="flex flex-col gap-2">
              <ActionCard href="/wardrobe" icon={<Plus size={16} />} title="Add to closet" />
              <ActionCard href="/studio" icon={<Sparkles size={16} />} title="Try on an outfit" />
              <ActionCard href="/stylist" icon={<MessageCircle size={16} />} title="Ask your stylist" />
            </div>
          </div>
```

- [ ] **Step 3: Manual verification**

This has no automated frontend test (matches the existing coverage level for Dashboard components — see spec's Testing section). Verify manually:

1. Ensure the backend is running with Task 1's route live (restarted per Task 1 Step 5).
2. Start the frontend dev server if not already running: `cd frontend && npm run dev`.
3. Log in as a real or disposable test account, navigate to `/dashboard`.
4. Confirm the "Monthly Try-Ons" card appears in the right column showing `0 of 5 used this month` with an empty (or near-empty) gold progress bar.
5. Using the `backend/tests/seed_usage_state.py` helper from earlier in this session, seed usage for the logged-in account:
   ```
   cd backend
   venv\Scripts\python.exe -m tests.seed_usage_state <your-account-email> tryon 3
   ```
6. Reload `/dashboard`. Confirm the meter now shows `3 of 5 used this month` with the bar at 60% width.
7. Reset the seeded state so the account isn't left artificially capped: `venv\Scripts\python.exe -m tests.seed_usage_state <your-account-email> reset`.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/dashboard/UsageMeter.tsx frontend/app/dashboard/page.tsx
git commit -m "feat: add usage meter to Dashboard"
```

---

### Task 3: Frontend — Continue-item derivation + `ContinueCard` component

**Files:**
- Create: `frontend/components/dashboard/ContinueCard.tsx`
- Modify: `frontend/app/dashboard/page.tsx` (bump fetch limit, derive continue item, render the card)

**Interfaces:**
- Consumes: `WardrobeItem` and `TryOnResult` types (existing, `frontend/types/index.ts`)
- Produces: `export function ContinueCard({ item }: { item: WardrobeItem })`. Rendered by `DashboardPage` only when a qualifying item exists.

- [ ] **Step 1: Create the component**

Create `frontend/components/dashboard/ContinueCard.tsx`:

```tsx
"use client";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import type { WardrobeItem } from "@/types";

export function ContinueCard({ item }: { item: WardrobeItem }) {
  return (
    <Link
      href={`/studio?item=${item.id}`}
      className="surface surface-hover block p-3"
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.image_url}
          alt={item.name}
          style={{ width: 44, height: 44, objectFit: "cover", flexShrink: 0, border: "1px solid var(--border-hover)" }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Sparkles size={11} style={{ color: "var(--gold)" }} />
            <span className="text-[9px] font-mono uppercase tracking-widest" style={{ color: "var(--gold)" }}>
              Continue
            </span>
          </div>
          <div className="text-xs sm:text-sm font-display leading-tight truncate" style={{ color: "var(--text)" }}>
            See {item.name} on you
          </div>
        </div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Derive the continue item and wire it in**

In `frontend/app/dashboard/page.tsx`, add the import alongside the existing component imports:

```tsx
import { ContinueCard } from "@/components/dashboard/ContinueCard";
```

Change the recent-tryons fetch (currently line 51, `apiGet<TryOnResult[]>(\`/api/tryon/recent?all=true\`),`) to request more history so the derivation below doesn't false-negative for accounts with more than the default 12 results:

```tsx
      apiGet<TryOnResult[]>(`/api/tryon/recent?all=true&limit=100`),
```

Add the derivation below the existing `categoryCount` line (currently line 75, `const categoryCount = new Set(items.map(i => i.category)).size;`):

```tsx
  const triedItemIds = new Set(
    recent.filter(r => r.status === "done" && r.wardrobe_item_id).map(r => r.wardrobe_item_id)
  );
  const continueItem = [...items]
    .filter(i => !triedItemIds.has(i.id))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
```

Render the card above the `ActionCard` stack (currently lines 141-145), only when `continueItem` exists:

```tsx
            <UsageMeter />
            {continueItem && <ContinueCard item={continueItem} />}
            <div className="flex flex-col gap-2">
```

- [ ] **Step 3: Manual verification**

1. Log in as a test account with at least one wardrobe item that has never been tried on (a freshly added item, or check via `/wardrobe`).
2. Navigate to `/dashboard`. Confirm the Continue card appears above the action-card stack, showing that item's thumbnail and "See {item name} on you".
3. Click the card. Confirm it navigates to `/studio?item=<id>` (the exact item id from the card).
4. If a wardrobe item exists but every item has a `status === "done"` try-on already, confirm the card does not render (no empty state, nothing shown).

- [ ] **Step 4: Commit**

```bash
git add frontend/components/dashboard/ContinueCard.tsx frontend/app/dashboard/page.tsx
git commit -m "feat: add Continue card to Dashboard for untried wardrobe items"
```

---

### Task 4: Frontend — Studio `?item=` preselect

**Files:**
- Modify: `frontend/app/studio/page.tsx` (read the query param when wardrobe items load, currently line 175)

**Interfaces:**
- Consumes: `setSelected(ids: string[]): void` from `useAppStore` (existing, already destructured at line 47 in this file)
- Produces: Studio preselects the item named by `?item=<id>` in the URL when the page loads, if that id belongs to the logged-in user's wardrobe.

- [ ] **Step 1: Add the preselect logic**

In `frontend/app/studio/page.tsx`, change the wardrobe fetch (currently line 175):

```tsx
    apiGet<WardrobeItem[]>(`/api/wardrobe`).then(data => { setItems(data); setCachedWardrobe(data); }).catch(() => {});
```

to:

```tsx
    apiGet<WardrobeItem[]>(`/api/wardrobe`).then(data => {
      setItems(data);
      setCachedWardrobe(data);
      const preselectId = new URLSearchParams(window.location.search).get("item");
      if (preselectId && data.some(i => i.id === preselectId)) {
        setSelected([preselectId]);
      }
    }).catch(() => {});
```

`window.location.search` is read directly (not `useSearchParams()`) to avoid requiring a Suspense boundary around this already-large client component — this file has no existing Suspense wrapper, unlike `frontend/app/chat/page.tsx`. Reading it once inside this existing `useEffect` callback is sufficient since the value is only needed at mount.

- [ ] **Step 2: Manual verification**

1. Restart the frontend dev server if needed (Next.js dev usually hot-reloads; verify the change is live by checking the browser console for reload activity, or hard-refresh).
2. From the Dashboard, click a Continue card (Task 3) — or manually navigate to `/studio?item=<a-real-wardrobe-item-id>`.
3. Confirm the item is shown as selected in Studio's item picker (the selection indicator/number badge appears on it) without any manual click.
4. Navigate to `/studio?item=00000000-0000-0000-0000-000000000000` (a nonexistent id). Confirm Studio loads normally with no selection and no error — the invalid id is silently ignored.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/studio/page.tsx
git commit -m "feat: preselect wardrobe item in Studio via ?item= query param"
```

---

## Post-Implementation Checklist

- [ ] Run the full backend test suite once more to confirm nothing regressed: `cd backend && venv\Scripts\python.exe -m tests.test_usage_scalability`
- [ ] Run `cd frontend && npx tsc --noEmit` to confirm no type errors across the four modified/created files
- [ ] Run `cd frontend && npm run build` to confirm the production build succeeds (per this repo's Stop-hook convention of verifying the build)
- [ ] Full manual walkthrough on the running local site: fresh dashboard load (no usage, no continue item) → add a wardrobe item → dashboard shows Continue card → seed usage → dashboard shows meter progress → click through to Studio with preselect working
