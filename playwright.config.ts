import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

const localChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    viewport: { width: 1440, height: 1000 },
    launchOptions: { executablePath: process.env.CHROME_PATH || (existsSync(localChrome) ? localChrome : undefined) },
    screenshot: "only-on-failure", trace: "retain-on-failure",
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: !process.env.CI, timeout: 60_000,
  },
});
