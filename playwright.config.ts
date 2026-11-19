import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  timeout: 20000,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "artifacts/e2e-results.json" }]],
  outputDir: "artifacts/playwright",
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "msedge", use: { ...devices["Desktop Edge"], channel: "msedge" } },
  ],
  webServer: {
    command: "node scripts/start-demo.mjs",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 15000,
  },
});
