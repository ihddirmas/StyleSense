import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * The golden path: selfie -> add a wardrobe item -> try-on -> save outfit.
 *
 * Every generation endpoint is stubbed, so this spends ZERO Runway/YouCam/
 * Anthropic credits and needs no seeded wardrobe data -- it drives the real
 * UI against fabricated responses and asserts on what the user can actually
 * see. Auth is the one real thing: the `authenticated` project in
 * playwright.config.ts injects e2e/.auth/user.json from auth.setup.ts, so
 * these tests start already signed in.
 *
 * Note: this app holds a Supabase Realtime WebSocket open (Sidebar.tsx), so
 * `waitForLoadState("networkidle")` never resolves -- wait on UI signals
 * only. Same constraint as cold-start.spec.ts.
 */

// 1x1 transparent PNG. Serves every image request so next/image never reaches
// the network for a Supabase URL that does not exist.
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkAAAABgADm78GJQAAAABJRU5ErkJggg==",
  "base64",
);

const SELFIE_URL = "https://stub.supabase.co/storage/v1/object/public/selfies/e2e-selfie.jpg";
const ITEM_IMAGE_URL = "https://stub.supabase.co/storage/v1/object/public/wardrobe/e2e-blazer.jpg";
const TRYON_URL = "https://stub.supabase.co/storage/v1/object/public/tryons/e2e-result.jpg";

const ITEM_NAME = "E2E Navy Blazer";
const OUTFIT_NAME = "E2E Golden Path Outfit";

function wardrobeItem() {
  return {
    id: "e2e-item-1",
    user_id: "e2e-user",
    name: ITEM_NAME,
    category: "tops",
    occasion: "casual",
    color: "navy",
    brand: null,
    tags: [],
    image_url: ITEM_IMAGE_URL,
    cutout_url: null,
    source_url: null,
    created_at: new Date().toISOString(),
  };
}

/** Mutable per-test record of what the app actually asked the backend to do. */
interface Calls {
  selfieUploaded: boolean;
  itemUploaded: boolean;
  tryOnBody: Record<string, unknown> | null;
  savedOutfitBody: Record<string, unknown> | null;
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

/**
 * Installs the full stub layer. `wardrobe` starts empty and gains the item
 * once the add flow posts it, so the grid transition is the real one the user
 * sees rather than a pre-seeded list.
 */
async function stubBackend(page: Page): Promise<Calls> {
  const calls: Calls = {
    selfieUploaded: false,
    itemUploaded: false,
    tryOnBody: null,
    savedOutfitBody: null,
  };
  const wardrobe: ReturnType<typeof wardrobeItem>[] = [];
  const selfies: string[] = [];

  // Images: both the next/image optimizer and any direct <img src> hit.
  await page.route("**/_next/image**", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: PNG_1X1 }),
  );
  await page.route("https://stub.supabase.co/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: PNG_1X1 }),
  );

  // --- avatar ---
  await page.route("**/api/avatar/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/upload-selfie") && method === "POST") {
      calls.selfieUploaded = true;
      selfies.push(SELFIE_URL);
      return json(route, { selfie_url: SELFIE_URL, selfie_urls: selfies });
    }
    if (url.includes("/selfies")) {
      return json(route, { selfie_urls: selfies, primary_url: selfies[0] ?? null });
    }
    if (url.includes("/full-body")) return json(route, { full_body_url: null });
    if (url.includes("/stylized-video")) return json(route, { url: null, status: "idle" });
    if (url.includes("/stylized")) return json(route, { url: null, status: "idle" });
    if (url.includes("/stylist")) return json(route, { image_url: null, video_url: null });
    if (url.includes("/me")) {
      return json(route, {
        avatar_selfie_url: selfies[0] ?? null,
        full_body_url: null,
        color_profile: null,
        kibbe_analysis: null,
      });
    }
    return json(route, {});
  });

  // --- wardrobe ---
  await page.route("**/api/wardrobe**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/detect-items")) {
      // Exactly one detected item keeps AddItemModal on its simple
      // single-item path (submit() auto-uploads when detected.length === 1)
      // instead of opening the multi-item review checklist, or -- with an
      // empty array -- the "no clothing items detected" error path.
      return json(route, {
        image_url: ITEM_IMAGE_URL,
        detected: [
          { name: ITEM_NAME, category: "tops", color: "navy", brand: null, occasion: "casual", position: null },
        ],
      });
    }
    if (url.includes("/upload") && method === "POST") {
      calls.itemUploaded = true;
      const item = wardrobeItem();
      wardrobe.push(item);
      return json(route, item);
    }
    if (url.includes("/outfit-suggestions")) return json(route, { suggestions: [] });
    if (method === "GET") return json(route, wardrobe);
    return json(route, {});
  });

  // --- try-on (the expensive one: never reaches the backend) ---
  await page.route("**/api/tryon/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/usage-status")) {
      return json(route, {
        tryon: { used: 0, limit: 50 },
        animate: { used: 0, limit: 5 },
        plan: "free",
      });
    }
    if (url.includes("/recent")) return json(route, []);
    if (url.includes("/generate") && method === "POST") {
      calls.tryOnBody = route.request().postDataJSON();
      return json(route, {
        result_image_url: TRYON_URL,
        result_id: "e2e-tryon-1",
      });
    }
    if (url.includes("/save") && method === "POST") return json(route, { saved: true });
    return json(route, {});
  });

  // --- outfits ---
  await page.route("**/api/outfits**", async (route) => {
    const method = route.request().method();
    if (route.request().url().includes("/save") && method === "POST") {
      calls.savedOutfitBody = route.request().postDataJSON();
      return json(route, { id: "e2e-outfit-1" });
    }
    if (method === "GET") return json(route, []);
    return json(route, {});
  });

  // Analytics must never leave the machine during a test run.
  await page.route("**/ingest/**", (route) => route.fulfill({ status: 200, body: "{}" }));

  return calls;
}

async function uploadSelfie(page: Page) {
  await page.goto("/settings");

  const selfieLabel = page.locator("label", { hasText: /Add selfie|Add another/ }).first();
  await expect(selfieLabel).toBeVisible({ timeout: 20000 });
  await selfieLabel.locator('input[type="file"]').setInputFiles({
    name: "selfie.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });
}

async function addWardrobeItem(page: Page) {
  await page.goto("/wardrobe");

  await page.getByRole("button", { name: /Add item/i }).first().click();

  const dialog = page.getByRole("heading", { name: "Add item" });
  await expect(dialog).toBeVisible();

  await page.locator('input[type="file"]').first().setInputFiles({
    name: "blazer.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });

  await page.getByPlaceholder("Navy linen blazer").fill(ITEM_NAME);
  await page.getByRole("button", { name: /Add to wardrobe/i }).click();
}

/**
 * Studio renders each wardrobe item twice: a mobile horizontal-scroll strip
 * (`lg:hidden`, selectable via `title={it.name}`) and a desktop grouped grid
 * (`hidden lg:flex`, selectable via `aria-label="Select {name}"`) -- distinct
 * markup, not just a CSS-hidden duplicate. `:visible` across both accessible
 * names picks whichever one actually renders for this viewport.
 */
function studioItemButton(page: Page, name: string) {
  return page.locator(`button[title="${name}"]:visible, button[aria-label="Select ${name}"]:visible`).first();
}

test.describe("Golden path", () => {
  test("selfie -> wardrobe item -> try-on -> saved outfit", async ({ page }) => {
    const calls = await stubBackend(page);

    // --- 1. selfie ------------------------------------------------------
    await uploadSelfie(page);

    // The user-visible proof: the empty "Add selfie" slot becomes a thumbnail
    // and the CTA changes to "Add another".
    await expect(page.locator("label", { hasText: "Add another" })).toBeVisible({ timeout: 20000 });
    expect(calls.selfieUploaded).toBe(true);

    // --- 2. wardrobe item -----------------------------------------------
    await addWardrobeItem(page);

    // Modal closes and the item appears in the grid by name.
    await expect(page.getByRole("heading", { name: "Add item" })).not.toBeVisible({ timeout: 15000 });
    await expect(page.getByText(ITEM_NAME).first()).toBeVisible({ timeout: 15000 });
    expect(calls.itemUploaded).toBe(true);

    // --- 3. try-on ------------------------------------------------------
    await page.goto("/studio");

    const itemButton = studioItemButton(page, ITEM_NAME);
    await expect(itemButton).toBeVisible({ timeout: 20000 });
    await itemButton.click();

    // Selection is visible as a numbered badge, and it's what enables the CTA.
    const manifest = page.getByRole("button", { name: /Manifest This Look/i });
    await expect(manifest).toBeEnabled({ timeout: 10000 });
    await manifest.click();

    // The stubbed result must actually render, and the try-on request must
    // have carried the selected item -- not just have been fired.
    await expect(page.getByRole("button", { name: /Save as outfit/i })).toBeVisible({ timeout: 30000 });
    expect(calls.tryOnBody).not.toBeNull();
    expect(JSON.stringify(calls.tryOnBody)).toContain("e2e-item-1");

    // --- 4. save outfit -------------------------------------------------
    await page.getByRole("button", { name: /Save as outfit/i }).click();

    const nameDialog = page.getByRole("heading", { name: /Name this outfit/i });
    await expect(nameDialog).toBeVisible();

    await page.locator("input.input:visible").last().fill(OUTFIT_NAME);
    await page.getByRole("button", { name: /^Save outfit$/i }).click();

    // Success is the toast the user reads, plus the recorded payload.
    await expect(page.getByText(/Saved to Outfits/i)).toBeVisible({ timeout: 15000 });
    expect(calls.savedOutfitBody).toMatchObject({
      name: OUTFIT_NAME,
      item_ids: ["e2e-item-1"],
      tryon_result_id: "e2e-tryon-1",
    });
  });

  test("try-on CTA stays disabled until an item is selected", async ({ page }) => {
    // Guards the precondition the golden path depends on: without this, a
    // regression that enables the button with no selection would send an
    // itemless (credit-spending) generate request in production.
    await stubBackend(page);
    await uploadSelfie(page);
    await addWardrobeItem(page);

    await page.goto("/studio");
    await expect(studioItemButton(page, ITEM_NAME)).toBeVisible({ timeout: 20000 });

    await expect(page.getByRole("button", { name: /Manifest This Look/i })).toBeDisabled();
  });
});
