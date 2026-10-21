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
  expect: {
    timeout: 7_000,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.002,
      stylePath: "./e2e/visual/screenshot.css",
    },
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } },
      testIgnore: /visual\//,
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], launchOptions: { executablePath } },
      grep: /@mobile/,
      testIgnore: /visual\//,
    },
    // Other engines (7.3): the behaviour suite on Firefox and WebKit. Left
    // out: screenshots (Chromium-only by design), the per-screen axe sweep
    // (engine-independent, and slow), and the checks that read Chromium-only
    // APIs (long tasks, layout shift, the DevTools heap).
    ...(["firefox", "webkit"] as const).map((engine) => ({
      name: engine,
      use: {
        ...devices[engine === "firefox" ? "Desktop Firefox" : "Desktop Safari"],
      },
      testIgnore: [
        /visual\//,
        /a11y-screens\.spec\.ts$/,
        /memory\.spec\.ts$/,
        /layoutshift\.spec\.ts$/,
      ],
    })),
    // Screenshot baselines (Phase 6). Pixels differ between machines, so
    // baselines are only made and checked in the Playwright Docker image:
    // `pnpm run e2e:visual` there, or the "Update screenshots" workflow.
    {
      name: "visual",
      testMatch: /visual\/.*\.spec\.ts$/,
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { executablePath },
        deviceScaleFactor: 1,
        contextOptions: { reducedMotion: "reduce" },
      },
    },
  ],
  snapshotPathTemplate: "{testDir}/visual/__screenshots__/{arg}{ext}",
  webServer: {
    command: `pnpm exec vite dev --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
