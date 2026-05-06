import { test } from "@playwright/test";
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
