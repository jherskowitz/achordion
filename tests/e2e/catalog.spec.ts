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
 *
 * Unlike the other catalog smokes, this one needs TWO live MusicBrainz
 * calls to resolve (getReleaseGroup 404s on a release id → resolve the
 * release to its parent group → redirect). When MB is briefly busy — the
 * 503 "web server is currently busy" that the nightly scheduled run
 * regularly catches — those throw and the page renders the upstream-error
 * boundary instead of redirecting. That's upstream weather, not a redirect
 * regression: the push / pull_request gate (where MB is healthy and where
 * real changes land) still exercises the redirect fully, and a genuine
 * break fails on EVERY run, not just when MB is down. So on a confirmed
 * upstream-error state we skip rather than red the suite — the same
 * tolerance the catalog pages already extend to transient MB/LB slowness.
 */
test(`catalog: /release-group/<release id> redirects to its release group`, async ({
  page,
}) => {
  await page.goto(`/release-group/${STABLE_MBIDS.release}`, {
    waitUntil: "domcontentloaded",
  });
  const rgUrl = new RegExp(
    `/release-group/${STABLE_MBIDS.releaseGroup}(?:$|[?#])`,
  );
  try {
    // Generous budget: absorbs mbFetch's one Retry-After retry plus the
    // error boundary's ~1s auto-retry before we conclude it won't settle.
    await expect(page).toHaveURL(rgUrl, { timeout: 25_000 });
  } catch (err) {
    // Did it stall on the upstream-error boundary (app/(app)/error.tsx)?
    // Those copy strings only appear when an upstream music API threw.
    const body = (await page.locator("body").innerText()).toLowerCase();
    const upstreamDown =
      body.includes("we hit a snag") ||
      body.includes("rate-limited by") ||
      body.includes("upstream music data api");
    test.skip(
      upstreamDown,
      "MusicBrainz unavailable (503/rate-limit) — can't exercise the release→release-group redirect this run",
    );
    throw err; // not an upstream outage → a real redirect failure
  }
  await expect(page.locator("body")).toContainText(/Please Please Me/i);
});
