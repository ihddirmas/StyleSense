```markdown
# StyleSense Development Patterns

> Auto-generated skill from repository analysis

## Overview

This skill teaches you how to contribute effectively to the StyleSense codebase, a TypeScript project focused on frontend and backend feature development without a major framework. You'll learn the repository's coding conventions, common workflows for implementing features, analytics, and design system consistency, as well as testing patterns and helpful CLI commands for frequent tasks.

---

## Coding Conventions

**File Naming**
- Use camelCase for files:  
  Example: `usageMeter.tsx`, `tryon.py`

**Import Style**
- Use alias imports for modules:
  ```typescript
  import UsageMeter from '@/components/dashboard/UsageMeter'
  ```

**Export Style**
- Use default exports for components and modules:
  ```typescript
  export default function UsageMeter() { ... }
  ```

**Commit Messages**
- Prefix with `feat`, `fix`, or `docs`
- Example:  
  `feat: add usage meter to dashboard`

---

## Workflows

### Add or Update Usage Cap or Meter
**Trigger:** When introducing or adjusting free-tier usage limits, displaying usage meters, or notifying users about cap hits.  
**Command:** `/add-usage-cap`

1. **Backend Enforcement:**  
   Update backend logic to enforce or modify usage caps.
   ```python
   # backend/services/usage_limits.py
   def check_usage_cap(user_id):
       # logic to check and enforce cap
   ```
2. **Database Schema:**  
   Update or create migration files for new tracking.
   ```sql
   -- backend/aurora_migration_usage_events_cap_email.sql
   ALTER TABLE usage_events ADD COLUMN cap_email_sent BOOLEAN DEFAULT FALSE;
   ```
3. **Frontend Display:**  
   Update frontend components to show usage.
   ```typescript
   // frontend/components/dashboard/UsageMeter.tsx
   export default function UsageMeter({ usage, cap }) { ... }
   ```
4. **Testing:**  
   Add or update tests for usage limits.
   ```python
   # backend/tests/test_usage_scalability.py
   def test_usage_cap_enforced():
       ...
   ```
5. **Analytics/Notifications (Optional):**  
   Instrument analytics or email notifications as needed.

---

### Instrument or Swap Analytics or Error Monitoring
**Trigger:** When adding, replacing, or updating analytics or error monitoring providers.  
**Command:** `/swap-analytics`

1. Update or replace instrumentation entry points.
   ```typescript
   // frontend/instrumentation.ts
   import * as Sentry from '@sentry/nextjs'
   Sentry.init({ ... })
   ```
2. Update or remove provider-specific config files.
   - `frontend/sentry.edge.config.ts`
   - `frontend/sentry.server.config.ts`
3. Update dependencies in `package.json` and `package-lock.json`.
4. Update `.env.example` for new environment variables.
5. Update backend middleware or analytics service files.
6. Update frontend global error boundaries or analytics providers.

---

### Feature Development: Frontend Implementation
**Trigger:** When adding a new user-facing feature or UI element.  
**Command:** `/new-frontend-feature`

1. Create or update frontend page/component files.
   ```typescript
   // frontend/components/dashboard/ContinueCard.tsx
   export default function ContinueCard(props) { ... }
   ```
2. If needed, update or create supporting backend endpoints.
   ```python
   # backend/routers/tryon.py
   @router.post("/tryon")
   def tryon_endpoint(...): ...
   ```
3. Update or create frontend store/state files.
   ```typescript
   // frontend/store/app.ts
   export const useAppStore = create(...)
   ```
4. Optionally, update or add tests and documentation.

---

### Apply Design System Consistency Fixes
**Trigger:** When enforcing or updating design system standards across the frontend.  
**Command:** `/apply-design-system`

1. Identify and replace non-standard styles with design system utility classes.
   ```tsx
   // Before:
   <div style={{ borderRadius: '8px', fontSize: '18px' }}>...</div>
   // After:
   <div className="rounded-lg text-lg">...</div>
   ```
2. Update multiple frontend component and page files.
3. Update design system config files (e.g., `tailwind.config.ts`) if new classes or tokens are needed.
4. Optionally, update e2e or visual tests to reflect style changes.

---

## Testing Patterns

- **Framework:** Playwright
- **File Pattern:** `*.spec.ts`
- **Example:**
  ```typescript
  // frontend/components/dashboard/UsageMeter.spec.ts
  import { test, expect } from '@playwright/test'

  test('UsageMeter displays correct cap', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.locator('.usage-meter')).toHaveText(/75% used/)
  })
  ```

---

## Commands

| Command              | Purpose                                                        |
|----------------------|----------------------------------------------------------------|
| /add-usage-cap       | Add or update usage caps, meters, and related notifications    |
| /swap-analytics      | Add, swap, or configure analytics/error monitoring providers   |
| /new-frontend-feature| Implement a new frontend feature or UI component              |
| /apply-design-system | Apply or update design system consistency across the frontend  |
```
