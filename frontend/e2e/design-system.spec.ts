import { test, expect } from "@playwright/test";

test.describe("Design system consistency", () => {
  test("Dashboard: UsagePill visible on mobile (375px)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/dashboard");
    // "networkidle" never fires on authenticated pages -- Sidebar.tsx keeps a
    // persistent Supabase Realtime WebSocket open. Wait for the native `load`
    // event instead, which only covers the initial resource load.
    await page.waitForLoadState("load");
    // On mobile the "try-ons" label span is `hidden` (Topbar.tsx) to save
    // space, so only the compact "N/N" count is visible text -- assert on
    // that instead of the full "N/N ... try-ons" phrase used on desktop.
    const pill = page.locator("text=/\\d+\\/\\d+/").first();
    // Generous timeout: Topbar, DashboardPage, and UsageMeter each fetch
    // /api/tryon/usage-status independently (see cold-start.spec.ts's
    // documented Dashboard test.fixme() for the full root cause), so this
    // can be slow under parallel test load even outside of a real cold start.
    await expect(pill).toBeVisible({ timeout: 15000 });
  });

  test("Dashboard: UsagePill visible on desktop (1440px)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dashboard");
    // "networkidle" never fires on authenticated pages -- Sidebar.tsx keeps a
    // persistent Supabase Realtime WebSocket open. Wait for the native `load`
    // event instead, which only covers the initial resource load.
    await page.waitForLoadState("load");
    const pill = page.locator("text=/\\d+\\/\\d+.*try-ons/").first();
    // See mobile test above for why this needs a generous timeout.
    await expect(pill).toBeVisible({ timeout: 15000 });
  });

  test("Studio: event suggestion chips use the design system's button radius token", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/studio");
    // "networkidle" never fires on authenticated pages -- Sidebar.tsx keeps a
    // persistent Supabase Realtime WebSocket open. Wait for the native `load`
    // event instead, which only covers the initial resource load.
    await page.waitForLoadState("load");
    // The "Place in event" panel (and its preset chips) is gated behind
    // FEATURES.eventScene, which is off by default under the documented MVP
    // cut (see lib/features.ts). Skip cleanly when it's not in this build
    // rather than failing on a feature that isn't meant to be present.
    const chips = page.locator("button.chip", { hasText: "beach wedding" });
    if ((await chips.count()) === 0) {
      test.skip(true, "eventScene is behind FEATURES.eventScene (off under MVP_MODE) -- chips aren't rendered");
    }
    await expect(chips.first()).toBeVisible();
    // Chips deliberately use the sharp editorial --radius-btn token (2px),
    // not a fully-rounded pill -- this replaced the old rounded-full look
    // as part of the Luxe Architecture design pass.
    const borderRadius = await chips.first().evaluate((el) =>
      window.getComputedStyle(el).borderRadius
    );
    expect(borderRadius).toBe("2px");
  });

  test("Studio: no arbitrary text-[Npx] bracket classes used (off-scale font sizes)", async ({ page }) => {
    await page.goto("/studio");
    // "networkidle" never fires on authenticated pages -- Sidebar.tsx keeps a
    // persistent Supabase Realtime WebSocket open. Wait for the native `load`
    // event instead, which only covers the initial resource load.
    await page.waitForLoadState("load");
    // This checks for the literal Tailwind arbitrary-value anti-pattern
    // (e.g. `text-[10px]`) in class lists, not computed font-size -- the
    // design system's own `text-2xs` token legitimately computes to 10px
    // (see tailwind.config.ts) and must not be flagged as a violation.
    const hasArbitraryFontSize = await page.evaluate(() => {
      const all = document.querySelectorAll("*");
      return Array.from(all).some((el) => {
        const cls = typeof el.className === "string" ? el.className : "";
        return /text-\[(10|9)px\]/.test(cls);
      });
    });
    expect(hasArbitraryFontSize).toBe(false);
  });

  test("Aria: voice tab no longer exists", async ({ page }) => {
    await page.goto("/stylist");
    // "networkidle" never fires on authenticated pages -- Sidebar.tsx keeps a
    // persistent Supabase Realtime WebSocket open. Wait for the native `load`
    // event instead, which only covers the initial resource load.
    await page.waitForLoadState("load");
    const voiceButton = page.locator("button:has-text('Voice')");
    await expect(voiceButton).toHaveCount(0);
  });

  // KNOWN GAP: chat/social is behind FEATURES.social (off under the
  // documented MVP cut, see lib/features.ts), and the seeded E2E QA account
  // has no friends/conversations, so /chat always renders its empty state
  // (no thread selected -> no message composer, no Share button either).
  // Revisit once social is back in MVP scope and a friend fixture exists.
  test.fixme("Chat: no free-text message composer", async ({ page }) => {
    await page.goto("/chat");
    await page.waitForLoadState("load");
    const textInput = page.locator('input[type="text"], textarea');
    const shareButton = page.locator("button:has-text('Share')");
    const hasTextInput = (await textInput.count()) > 0;
    const hasShareButton = (await shareButton.count()) > 0;
    expect(hasTextInput).toBe(false);
    expect(hasShareButton).toBe(true);
  });

  for (const route of ["/friends", "/wardrobe", "/dashboard"]) {
    test(`${route}: no arbitrary text-[Npx] bracket classes used (off-scale font sizes)`, async ({ page }) => {
      await page.goto(route);
      // "networkidle" never fires on authenticated pages -- Sidebar.tsx keeps a
      // persistent Supabase Realtime WebSocket open. Wait for the native `load`
      // event instead, which only covers the initial resource load.
      await page.waitForLoadState("load");
      // See the Studio version of this test above for why this checks class
      // names rather than computed font-size.
      const hasArbitraryFontSize = await page.evaluate(() => {
        const all = document.querySelectorAll("*");
        return Array.from(all).some((el) => {
          const cls = typeof el.className === "string" ? el.className : "";
          return /text-\[(10|9)px\]/.test(cls);
        });
      });
      expect(hasArbitraryFontSize).toBe(false);
    });
  }
});
