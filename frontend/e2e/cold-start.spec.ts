import { test, expect } from "@playwright/test";

/**
 * Render's free-tier backend spins down after 15min idle and takes 30-60s+ to
 * cold-start on the next request. During that window, pages must show a real
 * loading state -- not a premature "empty wardrobe / add your first item"
 * hint that flashes before the slow response actually lands. These specs
 * simulate that delay deterministically (a few seconds, not the real 30-60s)
 * so they stay fast and CI-friendly while still exercising the same race.
 *
 * Note: this app keeps a persistent Supabase Realtime WebSocket connection
 * open (Sidebar.tsx), so `page.waitForLoadState("networkidle")` never
 * resolves here -- wait on specific UI signals instead.
 */

const COLD_START_DELAY_MS = 4000;

async function delayApiRoutes(page: import("@playwright/test").Page, patterns: string[]) {
  for (const pattern of patterns) {
    await page.route(`**${pattern}*`, async (route) => {
      await new Promise((r) => setTimeout(r, COLD_START_DELAY_MS));
      await route.continue();
    });
  }
}

test.describe("Cold-start loading states", () => {
  test("Dashboard: does not show the empty-wardrobe hint while the API is still in flight", async ({ page }) => {
    await delayApiRoutes(page, ["/api/wardrobe"]);

    await page.goto("/dashboard");

    // While the delayed response is still in flight, the "Get started" empty
    // panel (Add to closet / Try on an outfit / Talk to Aria) must not be
    // visible yet -- that would be the premature-hint bug this test exists
    // to catch (DashboardPage only renders it once `!loading`).
    await page.waitForTimeout(1500);
    await expect(page.getByText(/^Add to closet$/i)).not.toBeVisible();
  });

  // KNOWN ISSUE, tracked separately from the fix above: Dashboard mounts three
  // independent components that each fetch /api/tryon/usage-status on their
  // own (DashboardPage itself, UsageMeter, Topbar), and two independent
  // fetchers of /api/wardrobe (DashboardPage, LayoutClient's cache-warm
  // effect). Combined with the backend re-verifying the JWT against Supabase
  // on every single request (no auth caching -- see services/auth_service.py),
  // this request pile-up saturates the browser's 6-connections-per-origin
  // limit and measurably delays real content from ever appearing once any one
  // request is slow (cold start or otherwise). Fixing it means deduplicating
  // the fetches (shared cache/hook) and/or caching JWT verification
  // server-side -- a real architecture change, not a one-line patch.
  test.fixme(
    "Dashboard: eventually renders real data once the slow API resolves",
    async ({ page }) => {
      await delayApiRoutes(page, ["/api/wardrobe"]);
      await page.goto("/dashboard");
      await expect(page.getByText(/\d+ items?/i).first()).toBeVisible({ timeout: 20000 });
    }
  );

  test("Wardrobe: shows a shimmer/loading state, not the empty-closet CTA, during a slow API", async ({ page }) => {
    await delayApiRoutes(page, ["/api/wardrobe"]);

    await page.goto("/wardrobe");

    await page.waitForTimeout(1500);
    await expect(page.getByText(/wardrobe is empty/i)).not.toBeVisible();
    await expect(page.getByRole("button", { name: /add your first item/i })).not.toBeVisible();

    // Real items should eventually render for a seeded QA account.
    await expect(page.locator("img").first()).toBeVisible({ timeout: 20000 });
  });

  test("Studio: wardrobe panel doesn't flash 'Empty wardrobe' during a slow API", async ({ page }) => {
    await delayApiRoutes(page, ["/api/wardrobe", "/api/tryon/recent"]);

    await page.goto("/studio");

    await page.waitForTimeout(1500);
    await expect(page.getByText(/Empty wardrobe/i)).not.toBeVisible();

    // The delayed wardrobe fetch should eventually populate the item grid,
    // and the empty-state banner must never appear at all for this account.
    await expect(page.locator("img").first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/Empty wardrobe/i)).not.toBeVisible();
  });
});
