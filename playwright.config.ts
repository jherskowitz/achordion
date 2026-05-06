import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke-test config for Achordion. The same suite is meant to run in
 * three places:
 *
 *   1. Locally during a normal `npm run e2e` — `webServer` block below
 *      builds + boots `next start` against a fresh `.next` and tears
 *      it down on exit.
 *   2. From the CI workflow at `.github/workflows/e2e.yml` against the
 *      same locally-built stack.
 *   3. Against an arbitrary deployment (Vercel preview, prod) via
 *      `E2E_BASE_URL=https://… npm run e2e`. The webServer block is
 *      skipped automatically when that env var is set.
 *
 * Why webpack and not turbopack for the local build: this matches our
 * `npm run build` toolchain (the production pipeline) and keeps the
 * test stack identical to what users see post-deploy.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const isExternal = process.env.E2E_BASE_URL !== undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  // Smoke tests are intentionally tiny — fail fast.
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // CI runs are the ones that hit upstream MB / LB / archive.org and
  // the occasional flake-prone third-party service. Two retries soak
  // up transient noise without masking a real regression (test is
  // expected to land green on the first retry).
  retries: process.env.CI ? 2 : 0,
  // Smoke suite is small; running serial keeps console output
  // readable when something fails.
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["github"], ["list"]]
    : [["list"]],
  use: {
    baseURL,
    // Chromium-only by default — adding webkit/firefox doubles the
    // CI time and the bugs we'd catch are mostly app-level, not
    // engine-level. Re-evaluate if we ever land iOS-Safari-specific
    // CSS.
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Skip the local web server entirely when running against an
  // already-deployed URL.
  webServer: isExternal
    ? undefined
    : {
        command: "npm run build && npm start",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
