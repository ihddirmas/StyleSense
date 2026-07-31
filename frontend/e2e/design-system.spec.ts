import { test, expect } from "@playwright/test";

test.describe("Design system consistency", () => {
  test("Dashboard: UsagePill visible on mobile (375px)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    const pill = page.locator("text=/\\d+\\/\\d+.*try-ons/");
    await expect(pill.first()).toBeVisible();
  });

  test("Dashboard: UsagePill visible on desktop (1440px)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    const pill = page.locator("text=/\\d+\\/\\d+.*try-ons/");
    await expect(pill.first()).toBeVisible();
  });

  test("Studio: event suggestion chips are rounded-full", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/studio");
    await page.waitForLoadState("networkidle");
    const chips = page.locator("button:has-text('beach wedding')");
    await expect(chips.first()).toBeVisible();
    const borderRadius = await chips.first().evaluate((el) =>
      window.getComputedStyle(el).borderRadius
    );
    expect(borderRadius).toBe("9999px");
  });

  test("Studio: no text-[10px] or text-[9px] classes used", async ({ page }) => {
    await page.goto("/studio");
    await page.waitForLoadState("networkidle");
    const hasInvalidFontSize = await page.evaluate(() => {
      const all = document.querySelectorAll("*");
      return Array.from(all).some((el) => {
        const fontSize = window.getComputedStyle(el).fontSize;
        return fontSize === "10px" || fontSize === "9px";
      });
    });
    expect(hasInvalidFontSize).toBe(false);
  });

  test("Aria: voice tab no longer exists", async ({ page }) => {
    await page.goto("/stylist");
    await page.waitForLoadState("networkidle");
    const voiceButton = page.locator("button:has-text('Voice')");
    await expect(voiceButton).toHaveCount(0);
  });

  test("Chat: no free-text message composer", async ({ page }) => {
    await page.goto("/chat");
    await page.waitForLoadState("networkidle");
    const textInput = page.locator('input[type="text"], textarea');
    const shareButton = page.locator("button:has-text('Share')");
    const hasTextInput = (await textInput.count()) > 0;
    const hasShareButton = (await shareButton.count()) > 0;
    expect(hasTextInput).toBe(false);
    expect(hasShareButton).toBe(true);
  });

  for (const route of ["/friends", "/wardrobe", "/dashboard"]) {
    test(`${route}: no text-[10px] or text-[9px] classes used`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      const hasInvalidFontSize = await page.evaluate(() => {
        const all = document.querySelectorAll("*");
        return Array.from(all).some((el) => {
          const fontSize = window.getComputedStyle(el).fontSize;
          return fontSize === "10px" || fontSize === "9px";
        });
      });
      expect(hasInvalidFontSize).toBe(false);
    });
  }
});
