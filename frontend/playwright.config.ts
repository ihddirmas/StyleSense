import { defineConfig, devices } from "@playwright/test";
import fs from "fs";
import path from "path";

// Minimal .env loader (avoids adding a dotenv dependency for two lines).
function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf-8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
  }
}
loadEnvFile(path.resolve(__dirname, ".env.test.local"));

const authFile = "e2e/.auth/user.json";

// Set PLAYWRIGHT_BASE_URL to point the suite at a deployed target (e.g. a
// Vercel preview URL) instead of a local dev server -- see
// .github/workflows/e2e-preview.yml. Local runs still auto-start both
// servers as before.
const remoteBaseURL = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  use: { baseURL: remoteBaseURL || "http://localhost:3000" },
  webServer: remoteBaseURL
    ? undefined
    : [
        {
          command: "cd ../backend && venv/Scripts/python.exe -m uvicorn main:app --port 8000",
          port: 8000,
          timeout: 120 * 1000,
          reuseExistingServer: !process.env.CI,
        },
        {
          command: "npm run dev",
          port: 3000,
          timeout: 120 * 1000,
          reuseExistingServer: !process.env.CI,
        },
      ],
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "html",
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "authenticated",
      use: { ...devices["Desktop Chrome"], storageState: authFile },
      testIgnore: /auth\.setup\.ts/,
      dependencies: ["setup"],
    },
  ],
});
