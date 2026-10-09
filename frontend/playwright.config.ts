import { defineConfig, devices } from "@playwright/test";

/**
 * UI smoke suite. Runs the real frontend (`vite dev`) against an in-memory
 * fake API (e2e/support/fakeServer.ts), so it needs no Go backend and runs
 * the same locally and in CI. Run with `pnpm run e2e`.
 *
 * PLAYWRIGHT_CHROMIUM_EXECUTABLE points at a preinstalled Chromium when the
 * bundled browser isn't downloaded (sandboxes, some CI images).
 */
const PORT = 5199;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: { executablePath },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      grep: /@mobile/,
    },
  ],
  webServer: {
    command: `pnpm exec vite dev --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
