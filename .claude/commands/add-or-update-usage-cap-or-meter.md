---
name: add-or-update-usage-cap-or-meter
description: Workflow command scaffold for add-or-update-usage-cap-or-meter in StyleSense.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /add-or-update-usage-cap-or-meter

Use this workflow when working on **add-or-update-usage-cap-or-meter** in `StyleSense`.

## Goal

Implements or modifies free-tier usage caps and usage meter features, including backend enforcement, frontend display, and related analytics or notifications.

## Common Files

- `backend/services/usage_limits.py`
- `backend/routers/tryon.py`
- `backend/aurora_schema.sql`
- `backend/aurora_migration_usage_events_cap_email.sql`
- `backend/services/analytics_service.py`
- `backend/services/email_service.py`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Update backend logic to enforce or modify usage caps (e.g., usage_limits.py, tryon.py).
- Update or create database schema/migration files for new tracking (e.g., aurora_schema.sql, migration files).
- Update frontend components to display usage (e.g., UsageMeter.tsx, dashboard/page.tsx).
- Add or update tests for usage limits (e.g., test_usage_scalability.py).
- Optionally, instrument analytics or notifications (e.g., analytics_service.py, email_service.py).

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.