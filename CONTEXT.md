# StyleSense

AI-powered personal wardrobe + try-on web app. Users upload a selfie, add wardrobe items, generate try-on images/video via Runway, and get styling advice from Aria, an AI stylist.

## Language

**Job**:
A backend-persisted unit of asynchronous generation work (try-on, event-scene, or animate) that a user requested. Moves through `queued → running → ready | failed`. The backend is the source of truth for its status; the frontend polls it.
_Avoid_: Task (reserve for the frontend object), request, operation.

**Runway task**:
The async task Runway's own API returns for a single generation call (`task.id` from the Runway SDK). Exists only inside a Job's execution — a Job may wrap one or more Runway tasks over its lifetime (e.g. retries).
_Avoid_: Job, task (bare) — always qualify as "Runway task" to distinguish from a Job.

**Task** (frontend):
The in-memory, user-facing object in `store/tasks.ts` (`TaskKind`: tryon/event/animate/avatar_still/avatar_video) that drives the Studio's generating-state UI. Watches a Job's status via polling; does not itself persist across a page reload once a Job completes.
_Avoid_: Job — a frontend Task is a UI-layer view, not the source of truth.
