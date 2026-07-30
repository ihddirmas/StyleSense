import { defineConfig } from "@playwright/test";

export default defineConfig({
  use: { baseURL: "http://localhost:3000" },
  webServer: [
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
});
