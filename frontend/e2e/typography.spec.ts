import { test, expect } from "@playwright/test";

// This suite only exercises the public /login and /signup pages, which the
// app's own middleware redirects authenticated users away from (see
// middleware.ts) -- run it logged-out regardless of the project-level auth
// storageState.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Typography fixes", () => {
  const SCAN_PAGES = ["/login", "/signup"];

  for (const path of SCAN_PAGES) {
    test(`${path} — zero inline font-style props`, async ({ page }) => {
      await page.goto(path, { waitUntil: "networkidle" });

      const violations = await page.evaluate(() => {
        const results: { tag: string; selector: string; props: string[] }[] = [];
        const all = document.querySelectorAll("*");
        for (const el of all) {
          const inline = (el as HTMLElement).style;
          const props: string[] = [];
          if (inline.fontSize && inline.fontSize !== "") props.push("fontSize");
          if (inline.fontWeight && inline.fontWeight !== "") props.push("fontWeight");
          if (inline.fontFamily && inline.fontFamily !== "") props.push("fontFamily");
          if (inline.letterSpacing && inline.letterSpacing !== "") props.push("letterSpacing");
          if (props.length > 0) {
            const selector = el.id
              ? `#${el.id}`
              : el.className && typeof el.className === "string"
                ? `.${el.className.split(" ").filter(Boolean).join(".")}`
                : el.tagName.toLowerCase();
            results.push({ tag: el.tagName.toLowerCase(), selector, props });
          }
        }
        return results;
      });

      if (violations.length > 0) {
        console.log(`VIOLATIONS on ${path}:`);
        for (const v of violations) {
          console.log(`  <${v.tag}> ${v.selector} — inline ${v.props.join(", ")}`);
        }
      }

      expect(violations).toEqual([]);
    });
  }

  test("/login back-link has Tailwind classes not inline styles", async ({ page }) => {
    await page.goto("/login", { waitUntil: "networkidle" });

    const link = page.locator('a[href="/"]').first();
    await expect(link).toHaveClass(/text-sm/);
    await expect(link).toHaveClass(/font-medium/);
    await expect(link).toHaveClass(/tracking-wide/);

    // Ensure no inline font props
    const inlineFontSize = await link.getAttribute("style").then((s) => s?.includes("fontSize"));
    expect(inlineFontSize).toBeFalsy();
  });

  test("/signup back-link has Tailwind classes not inline styles", async ({ page }) => {
    await page.goto("/signup", { waitUntil: "networkidle" });

    const link = page.locator('a[href="/"]').first();
    await expect(link).toHaveClass(/text-sm/);
    await expect(link).toHaveClass(/font-medium/);
    await expect(link).toHaveClass(/tracking-wide/);
  });

  test("AuthCard toggle buttons use Tailwind classes", async ({ page }) => {
    await page.goto("/login", { waitUntil: "networkidle" });

    // The mode toggle buttons
    const signInBtn = page.locator("button", { hasText: "Sign in" }).first();
    const signUpBtn = page.locator("button", { hasText: "Sign up" }).first();

    for (const btn of [signInBtn, signUpBtn]) {
      await expect(btn).toHaveClass(/text-xs/);
      await expect(btn).toHaveClass(/tracking-wide/);
    }
  });
});
