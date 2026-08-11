---
status: accepted
---

# Persist try-on/event/animate generation as backend Jobs

`POST /tryon/generate`, `/generate-multi`, `/event-scene`, and `/animate` currently block the HTTP request for up to 5 minutes inside `runway_service.py`'s synchronous `wait_for_task_output(timeout=300)`, occupying one of only 4 `ThreadPoolExecutor` workers (`tryon_service.py`) for the whole wait, and the frontend's "progress bar" (`GeneratingState.tsx`) is a fake 6s timer, not real status. We're replacing this with the pattern already proven by the avatar pipeline (`avatar.py` `regenerate-stylized`, polled via `GET /stylized`): each endpoint validates input, persists a **Job** row, dispatches the Runway work to `BackgroundTasks`, and returns immediately; the frontend polls the Job's status instead of holding the request open.

## Scope (v1)

- Covers single-result generations only: `generate`, `event-scene`, `animate`. `generate-multi` is explicitly out of scope — it keeps its existing synchronous, partial-success response shape (`{result_image_url, failed: [...]}`) because a binary `queued/running/ready/failed` Job state doesn't represent per-item partial failure.
- A Job is `ready` once its output is rehosted to Supabase Storage. B2 archival failure stays non-fatal (as it already is today) and does not block `ready` or need its own state.
- Cancellation is client-side abandonment only: the frontend stops polling, the backend Job keeps running to completion. Runway exposes no API to cancel an in-flight generation, so there is nothing to actually stop server-side in v1.

## Considered

Kept Job state in-memory (simpler, no migration) instead of a Supabase table — rejected because it doesn't survive a Render restart or generalize to multiple backend instances, and the avatar pipeline already establishes DB-column-as-source-of-truth as this codebase's pattern for exactly this kind of long-running generation state.
