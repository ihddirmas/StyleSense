import { test, expect, type Page } from "@playwright/test";

/**
 * The golden path, end to end from the user's point of view:
 *
 *   selfie upload (onboarding) -> add a wardrobe item -> generate a try-on
 *   (Studio) -> save it as an outfit
 *
 * Every backend call is stubbed at the network layer so the run spends zero
 * generation credits, writes nothing to the QA account, and is deterministic
 * enough for CI. What this spec actually verifies is the FRONTEND contract:
 * that each user action fires the right API request and that the UI advances
 * through the user-visible states (step transitions, result image, toasts).
 * Backend behavior is covered separately by backend/tests.
 *
 * Auth still comes from the shared storage state produced by auth.setup.ts —
 * the app shell (middleware session check, AuthProvider) talks to real
 * Supabase auth exactly like the other authenticated specs.
 *
 * Image URLs point at a fake bucket host (e2e-stub.supabase.co) which is
 * within next.config.mjs's allowed `**.supabase.co` remotePatterns; both the
 * raw URLs and the /_next/image optimizer requests for them are fulfilled
 * with an in-memory 1x1 PNG, so no real image traffic leaves the machine.
 *
 * Same caveat as cold-start.spec.ts: the Sidebar holds a persistent Supabase
 * Realtime WebSocket open, so never wait on "networkidle" here.
 */

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

const stubImg = (name: string) =>
  `https://e2e-stub.supabase.co/storage/v1/object/public/e2e/${name}.png`;

const ITEM = {
  id: "e2e-item-1",
  user_id: "e2e-user",
  name: "Navy Linen Blazer",
  category: "outerwear",
  occasion: "casual",
  color: "navy",
  brand: null,
  tags: ["e2e"],
  image_url: stubImg("blazer"),
  cutout_url: null,
  source_url: null,
  created_at: "2026-08-17T00:00:00Z",
};

const TRYON_RESULT_ID = "e2e-tryon-1";

interface CapturedRequests {
  tryonGenerate: Record<string, unknown>[];
  outfitSave: Record<string, unknown>[];
  tryonSave: Record<string, unknown>[];
}

async function stubBackend(page: Page, captured: CapturedRequests) {
  // Analytics: keep PostHog fully offline.
  await page.route("**/ingest/**", (route) => route.fulfill({ status: 200, json: {} }));

  // Stubbed "storage" images, requested directly by plain <img> tags.
  await page.route("https://e2e-stub.supabase.co/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: TINY_PNG })
  );

  // next/image routes remote images through its optimizer endpoint (the
  // fetch then happens server-side where page.route can't intercept), so
  // answer optimizer requests for our stub host directly in the browser.
  await page.route("**/_next/image*", (route) => {
    const inner = new URL(route.request().url()).searchParams.get("url") || "";
    if (inner.includes("e2e-stub.supabase.co")) {
      return route.fulfill({ status: 200, contentType: "image/png", body: TINY_PNG });
    }
    return route.continue();
  });

  // One dispatcher for the whole backend API. This intentionally swallows
  // EVERY /api/ request (unknown ones get an empty 200) so the spec cannot
  // silently fall through to a real backend and spend credits.
  await page.route("**/api/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown) => route.fulfill({ status: 200, json: body });

    switch (`${request.method()} ${path}`) {
      // --- Onboarding: selfie + analysis ---
      case "POST /api/avatar/upload-selfie":
        return json({ selfie_url: stubImg("selfie"), status: "ok" });
      case "GET /api/stylist/profiles":
        return json({
          color_profile: {
            season: "autumn",
            undertone: "warm",
            confidence: 0.85,
            flattering_colors: ["rust", "olive", "camel", "cream"],
          },
          kibbe_analysis: { kibbe_type: "soft_natural", confidence: 0.8 },
          ready: true,
        });

      // --- Wardrobe add (Claude vision + garment cleaner, both stubbed) ---
      case "POST /api/wardrobe/detect-items":
        return json({
          image_url: stubImg("source"),
          detected: [{ name: ITEM.name, category: ITEM.category, color: ITEM.color }],
        });
      case "POST /api/wardrobe/upload":
        return json(ITEM);
      case "GET /api/wardrobe":
        return json([ITEM]);

      // --- Studio page loads ---
      case "GET /api/tryon/recent":
        return json([]);
      case "GET /api/avatar/selfies":
        return json({ selfie_urls: [stubImg("selfie")], primary_url: stubImg("selfie") });
      case "GET /api/avatar/full-body":
        return json({ full_body_url: null });
      case "GET /api/avatar/stylized":
        return json({ url: stubImg("stylized"), status: "ready" });
      case "GET /api/tryon/usage-status":
        return json({ tryon: { used: 0, limit: 10 }, animate: { used: 0, limit: 3 } });
      case "GET /api/chat/threads":
        return json([]);

      // --- Generation + save (the calls that would cost credits / write DB) ---
      case "POST /api/tryon/generate":
      case "POST /api/tryon/generate-multi":
        captured.tryonGenerate.push(request.postDataJSON());
        return json({ result_image_url: stubImg("tryon-result"), result_id: TRYON_RESULT_ID });
      case "POST /api/outfits/save":
        captured.outfitSave.push(request.postDataJSON());
        return json({ id: "e2e-outfit-1" });
      case "POST /api/tryon/save":
        captured.tryonSave.push(request.postDataJSON());
        return json({ ok: true });

      default:
        return json({});
    }
  });
}

test.describe("Golden path", () => {
  test("selfie -> add wardrobe item -> try-on -> save outfit", async ({ page }) => {
    const captured: CapturedRequests = { tryonGenerate: [], outfitSave: [], tryonSave: [] };
    await stubBackend(page, captured);

    // --- Step 1: selfie upload on /onboarding ---
    await page.goto("/onboarding");
    await expect(page.getByRole("heading", { name: "Face selfie for your color season" })).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles({
      name: "selfie.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
    });

    // Upload succeeded -> the flow advances to the full-body step, which we skip.
    await expect(page.getByRole("heading", { name: "Full-body photo for Kibbe typing" })).toBeVisible();
    await page.getByRole("button", { name: "Skip Kibbe for now" }).click();

    // --- Step 2: profile reveal from the (stubbed) analysis ---
    await expect(page.getByRole("heading", { name: "Your style profile" })).toBeVisible();
    await expect(page.getByText("Autumn", { exact: true })).toBeVisible();
    await expect(page.getByText("Soft Natural", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();

    // --- Step 3: add a wardrobe item through the modal ---
    await expect(page.getByRole("heading", { name: "Add something to evaluate" })).toBeVisible();
    await page.getByRole("button", { name: "Add an item" }).click();
    await expect(page.getByRole("heading", { name: "Add item" })).toBeVisible();

    await page.locator('input[accept="image/jpeg,image/png,image/webp"]').setInputFiles({
      name: "blazer.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
    });
    await page.getByRole("button", { name: "Add to wardrobe" }).click();

    // Single detected item auto-adds (no checklist) and completes onboarding.
    await expect(page.getByText("Item added.")).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("heading", { name: "You're ready" })).toBeVisible();
    await expect(page.getByText(new RegExp(ITEM.name))).toBeVisible();

    // --- Step 4: try-on in the Studio ---
    await page.goto("/studio");

    const itemButton = page.getByRole("button", { name: `Select ${ITEM.name}` });
    await expect(itemButton).toBeVisible({ timeout: 15000 });
    await itemButton.click();
    await expect(page.getByRole("button", { name: `Deselect ${ITEM.name}` })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    const manifest = page.getByRole("button", { name: "Manifest This Look" });
    await expect(manifest).toBeEnabled();
    await manifest.click();

    // The stubbed generation resolves into the real result UI.
    await expect(page.getByAltText("Try-on result")).toBeVisible({ timeout: 15000 });
    expect(captured.tryonGenerate).toHaveLength(1);
    expect(captured.tryonGenerate[0]).toMatchObject({
      wardrobe_item_id: ITEM.id,
      item_image_url: ITEM.image_url,
    });

    // --- Step 5: save the look as an outfit ---
    await page.getByRole("button", { name: "Save as outfit" }).click();
    await expect(page.getByRole("heading", { name: "Name this outfit" })).toBeVisible();
    const nameInput = page.getByPlaceholder(ITEM.name);
    await nameInput.fill("Golden path look");
    await page.getByRole("button", { name: "Save outfit" }).click();

    await expect(page.getByText("Saved to Outfits + gallery.")).toBeVisible({ timeout: 10000 });
    expect(captured.outfitSave).toHaveLength(1);
    expect(captured.outfitSave[0]).toMatchObject({
      name: "Golden path look",
      item_ids: [ITEM.id],
      tryon_result_id: TRYON_RESULT_ID,
    });
    expect(captured.tryonSave[0]).toMatchObject({ tryon_id: TRYON_RESULT_ID });
  });
});
