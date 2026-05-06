import { test } from "@playwright/test";
import { assertCleanRoute } from "./_helpers";

/**
 * Static pages — pure SSR, no auth required, no upstream data sources
 * to flake. The expected text is the headline / page title that
 * should always be present in the body once the page renders.
 */
const STATIC_PAGES: Array<{
  path: string;
  expectedText: string | RegExp;
}> = [
  { path: "/", expectedText: /Achordion/i },
  { path: "/about", expectedText: /People-Powered Music Discovery/i },
  { path: "/faq", expectedText: /Frequently asked questions/i },
  { path: "/donate", expectedText: /Support the projects/i },
  { path: "/login", expectedText: /Sign in/i },
  { path: "/apps", expectedText: /Featured/i },
];

for (const spec of STATIC_PAGES) {
  test(`static: ${spec.path} renders cleanly`, async ({ page }) => {
    await assertCleanRoute(page, spec.path, {
      expectedText: spec.expectedText,
    });
  });
}

test("static: 404 page surfaces a 404 status", async ({ page }) => {
  // Not-found is not a regression — it's the route doing its job.
  // assertCleanRoute(...) takes the expected status as 404 here.
  await assertCleanRoute(page, "/this-route-does-not-exist", {
    expectedStatus: 404,
  });
});
