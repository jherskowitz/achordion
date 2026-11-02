import { test, expect } from "@playwright/test";
import { STABLE_MBIDS, assertCleanRoute } from "./_helpers";

/**
 * Catalog smoke — one stable artist / release-group / recording from
 * MusicBrainz. Each route exercises its own upstream chain (MB
 * `/artist`, `/release-group`, `/recording`, plus the LB stat /
 * popularity calls layered on top), so a green run here means the
 * whole catalog data path is at least serving 200s with the expected
 * entity name in the body.
 *
 * MBIDs are pinned in `_helpers.ts`. If MusicBrainz's canonical
 * Beatles MBID ever 404s these tests will start failing — and that
 * IS the regression we want to surface, not a fixture bug.
 */
const CATALOG_ROUTES: Array<{
  path: string;
  expectedText: string | RegExp;
}> = [
  {
    path: `/artist/${STABLE_MBIDS.artist}`,
    expectedText: /The Beatles/i,
  },
  {
    path: `/release-group/${STABLE_MBIDS.releaseGroup}`,
    expectedText: /Please Please Me/i,
  },
  {
    path: `/recording/${STABLE_MBIDS.recording}`,
    expectedText: /Hey Jude/i,
  },
];

for (const spec of CATALOG_ROUTES) {
  test(`catalog: ${spec.path} renders cleanly`, async ({ page }) => {
    await assertCleanRoute(page, spec.path, {
      expectedText: spec.expectedText,
    });
  });
}

/**
 * #107: a RELEASE id handed to /release-group/<id> (Parachord album pages,
 * older shared links) must land on its parent release-group page, not a
 * dead end. The redirect is client-side (the route streams via loading.tsx,
 * so it can't be a hard 308), which a real browser follows — `toHaveURL`
 * retries until the navigation settles on the release-group route.
 */
test(`catalog: /release-group/<release id> redirects to its release group`, async ({
  page,
}) => {
  await page.goto(`/release-group/${STABLE_MBIDS.release}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page).toHaveURL(
    new RegExp(`/release-group/${STABLE_MBIDS.releaseGroup}(?:$|[?#])`),
  );
  await expect(page.locator("body")).toContainText(/Please Please Me/i);
});
