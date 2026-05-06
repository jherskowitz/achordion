import { expect, test } from "@playwright/test";
import { assertCleanRoute, visit } from "./_helpers";

/**
 * Charts surfaces. Each tab has its own data source (LB, Apple RSS,
 * Earshot/college). Failure here usually means the upstream feed
 * shape changed or rate-limited us — both real production signals.
 */
const CHART_TABS: Array<{
  path: string;
  expectedText: string | RegExp;
}> = [
  // /charts redirects to /charts/listenbrainz; we navigate the redirect
  // target directly and let Playwright follow.
  { path: "/charts/listenbrainz", expectedText: /Charts/i },
  { path: "/charts/apple-music", expectedText: /Apple Music/i },
  { path: "/charts/college-radio", expectedText: /College/i },
];

for (const spec of CHART_TABS) {
  test(`charts: ${spec.path} renders cleanly`, async ({ page }) => {
    await assertCleanRoute(page, spec.path, {
      expectedText: spec.expectedText,
    });
  });
}

test("charts: /charts redirects to /charts/listenbrainz", async ({ page }) => {
  await page.goto("/charts");
  await expect(page).toHaveURL(/\/charts\/listenbrainz/);
});

test("charts: listenbrainz tab renders at least 10 entries", async ({ page }) => {
  // Smoke for "data source returned content" — anchors below the H1
  // are the chart rows. Threshold loose enough to tolerate a slow
  // upstream that returns 5–10 entries during a partial outage.
  const { response } = await visit(page, "/charts/listenbrainz");
  expect(response?.status()).toBe(200);
  const links = await page.locator("main a").count();
  expect(
    links,
    "listenbrainz chart looks empty — upstream data may be down",
  ).toBeGreaterThanOrEqual(10);
});
