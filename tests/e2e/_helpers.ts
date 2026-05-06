import type { Page, Response, ConsoleMessage } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Helpers shared across the smoke-test specs. Two main jobs:
 *
 *   1. Visit a route + assert it rendered cleanly *for our origin*.
 *      Third-party noise (gstatic favicon 404s, archive.org thumb
 *      500s, Vercel telemetry) gets logged but never fails the test —
 *      it's outside our control.
 *   2. Provide a small set of stable MBIDs to use in catalog-route
 *      smoke tests. Hard-coded on purpose: if Beatles' MBID ever 404s
 *      on MB, that's a real regression worth catching, not an
 *      arbitrary fixture failure.
 */

/** Stable canonical MBIDs picked from MusicBrainz for entity smokes. */
export const STABLE_MBIDS = {
  /** The Beatles. */
  artist: "b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d",
  /** "Please Please Me" by The Beatles (release group). */
  releaseGroup: "de208292-8db5-3aed-a14a-b37a84d8c521",
  /** "Hey Jude" by The Beatles (recording). */
  recording: "da972cd2-7eb1-4b3c-8474-4562f7ba0c07",
} as const;

interface VisitResult {
  response: Response | null;
  /** Same-origin failures only (4xx/5xx + console errors). */
  ownOriginFailures: string[];
}

/**
 * Navigate to `path`, collect any same-origin response and console
 * failures along the way, and return them. Caller decides what to
 * assert — most specs use `assertCleanRoute` which is the common case.
 *
 * `expectedStatus` defaults to 200; pass 404 (or another value) for
 * routes whose entire job is to surface an error page.
 */
export async function visit(
  page: Page,
  path: string,
): Promise<VisitResult> {
  const ownOriginFailures: string[] = [];
  // Playwright's BrowserContext doesn't expose baseURL on the public
  // type, so we re-derive it from the same env-var fallback chain
  // playwright.config.ts uses. Same fallback chain everywhere keeps
  // the same-origin filter consistent across local / CI / against-
  // deployment runs.
  const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
  const baseHost = new URL(baseURL).host;

  // Filter responses by origin matching baseURL — third-party noise
  // (gstatic favicons, archive.org cover-art thumbs, Vercel telemetry,
  // etc.) can 4xx/5xx for reasons we can't act on, so we ignore them.
  const onResponse = (resp: Response) => {
    const status = resp.status();
    if (status < 400) return;
    let host: string;
    try {
      host = new URL(resp.url()).host;
    } catch {
      return;
    }
    if (host !== baseHost) return;
    ownOriginFailures.push(
      `[${status}] ${resp.request().method()} ${resp.url()}`,
    );
  };

  // Browser console errors — same origin filter doesn't apply since
  // most console.error calls don't carry a URL, but we DO ignore the
  // common third-party complaints we know we can't fix (Lucide
  // image-optimization warnings, the Next.js LCP nudge, etc.). Add to
  // the allowlist below as the suite finds new noise.
  const CONSOLE_NOISE_ALLOWLIST = [
    /detected as the Largest Contentful Paint/i,
    /Image with src .* has either width or height modified/i,
    /Download the React DevTools/i,
    /Failed to load resource: the server responded with a status of 4(0[34]|29)/i,
  ];
  const onConsole = (msg: ConsoleMessage) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (CONSOLE_NOISE_ALLOWLIST.some((re) => re.test(text))) return;
    ownOriginFailures.push(`[console.error] ${text}`);
  };

  page.on("response", onResponse);
  page.on("console", onConsole);
  const response = await page
    .goto(path, { waitUntil: "domcontentloaded" })
    .catch(() => null);
  // Give late-firing requests + console errors a chance to surface
  // before assertions run, but cap the wait so the suite stays fast.
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
  page.off("response", onResponse);
  page.off("console", onConsole);
  return { response, ownOriginFailures };
}

/**
 * Common smoke assertion: route loads, returns the expected status,
 * page text contains a substring, and nothing same-origin 4xx/5xx'd
 * along the way.
 */
export async function assertCleanRoute(
  page: Page,
  path: string,
  opts: {
    expectedStatus?: number;
    expectedText?: string | RegExp;
  } = {},
): Promise<void> {
  const { response, ownOriginFailures } = await visit(page, path);
  expect(response, `no response for ${path}`).not.toBeNull();
  const status = response!.status();
  const expected = opts.expectedStatus ?? 200;
  expect(status, `${path} returned ${status}`).toBe(expected);
  if (opts.expectedText) {
    await expect(
      page.locator("body"),
      `${path} body missing expected content`,
    ).toContainText(opts.expectedText);
  }
  expect(
    ownOriginFailures,
    `${path} had same-origin failures:\n  ${ownOriginFailures.join("\n  ")}`,
  ).toEqual([]);
}
