import { test as setup, expect } from "@playwright/test";

const authFile = "e2e/.auth/user.json";

const EMAIL = process.env.E2E_TEST_EMAIL || process.env.TEST_USER_EMAIL;
const PASSWORD = process.env.E2E_TEST_PASSWORD || process.env.TEST_USER_PASSWORD;

setup("authenticate", async ({ page }) => {
  if (!EMAIL || !PASSWORD) {
    throw new Error(
      "E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set (also accepts TEST_USER_EMAIL / " +
      "TEST_USER_PASSWORD). Copy frontend/.env.test.example to .env.test.local and " +
      ".env.test.local and fill in a seed QA account with wardrobe items."
    );
  }

  await page.goto("/login");
  await page.getByPlaceholder("you@example.com").fill(EMAIL);
  await page.getByPlaceholder("••••••••").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).last().click();

  await page.waitForURL("**/dashboard", { timeout: 15000 });
  await expect(page).toHaveURL(/\/dashboard/);

  await page.context().storageState({ path: authFile });
});
