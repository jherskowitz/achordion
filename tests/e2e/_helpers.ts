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
  // The top-level navigation response is asserted separately by
  // `expectedStatus` in `assertCleanRoute` — its status is the
  // *point* of the request, not a hidden failure. Track its URL
  // here so the response listener can ignore it (otherwise a
  // deliberate 404 smoke like `/this-route-does-not-exist` would
  // double-count: once for `expectedStatus`, once as a "same-
  // origin failure"). Compare on pathname, not full URL, to handle
  // any trailing-slash / query normalization Playwright does.
  const navPath = new URL(path, baseURL).pathname;

  // URL substrings whose 4xx/5xx responses are expected outside of
  // Vercel deploys (i.e. the local CI stack). Vercel Analytics +
  // Speed Insights inject `<script src="/_vercel/insights/...">` and
  // matching speed-insights tags into every response — those paths
  // only exist when Vercel's edge is doing the script rewrite, so
  // `next start` against localhost 404s on each. Ignore both.
  const RESPONSE_NOISE_ALLOWLIST = [
    /\/_vercel\/(?:insights|speed-insights)\/script\.js/,
  ];
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
    if (RESPONSE_NOISE_ALLOWLIST.some((re) => re.test(resp.url()))) return;
    // Don't double-report the navigation's own response — the
    // caller asserts its status via `expectedStatus`.
    try {
      if (new URL(resp.url()).pathname === navPath) return;
    } catch {
      // unparseable URL — fall through and report it
    }
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
    // 4xx/5xx without URLs — Chromium strips the URL on the
    // console.error log line, so we can't tell same- from cross-
    // origin here. Same-origin failures are already caught with
    // their URLs by the `onResponse` listener above; anything that
    // surfaces here without a URL is necessarily third-party noise
    // (cover-art-archive thumb 500s, archive.org 404s, gstatic
    // favicons, ListenBrainz hiccups, etc.). Cover 4xx + 5xx.
    /Failed to load resource: the server responded with a status of [45]\d\d/i,
    // net::ERR_* — Chromium emits these for transport-level failures
    // (TLS handshake, DNS, connection reset). The CI server runs
    // plain HTTP on localhost, so any net::ERR_SSL_*, net::ERR_CERT_*,
    // or net::ERR_NAME_NOT_RESOLVED is necessarily a cross-origin
    // upstream (cover-art-archive, archive.org, etc.) and outside
    // our control. Same root-cause-bucket as the 4xx/5xx allowlist
    // above.
    /Failed to load resource: net::ERR_/i,
    // useParachordPresence opens ws://127.0.0.1:9876 to detect the
    // desktop app. In CI (or any non-developer environment) the WS
    // refuses, Chromium logs it at error level, and we'd flag a
    // false-positive on every page that mounts a play button. Real
    // browsers do the same in production for users without
    // Parachord-desktop installed; the hook's onclose handler keeps
    // the UX correct and the visual presence-state false.
    /WebSocket connection to 'ws:\/\/127\.0\.0\.1:9876.*ERR_CONNECTION_REFUSED/,
    // Same root cause as above when chrome can't even attempt the
    // handshake (e.g. when MV3 service-worker context blocks the
    // WS API entirely). Emitted differently across browser builds.
    /Failed to construct 'WebSocket'.*ws:\/\/127\.0\.0\.1:9876/,
    // Pair of the response-noise-allowlist Vercel-analytics 404s:
    // Chrome logs the MIME mismatch (the 404 returns text/html, not
    // application/javascript) at error level. Same root cause —
    // Vercel script rewrite only exists on Vercel deploys.
    /Refused to execute script from .*\/_vercel\/(?:insights|speed-insights)\/script\.js/,
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
