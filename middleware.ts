import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Edge bot block + per-IP page rate limit.
 *
 * Three layers, fastest to slowest, in order:
 *
 *   1. Datacenter ASN block. Real users browse from residential ISPs;
 *      bots overwhelmingly run on cloud / VPS infra. Vercel exposes
 *      the requester's AS number in `x-vercel-ip-asn` on every plan
 *      including Hobby. Drop known cloud-provider ASNs at the edge
 *      with effectively zero collateral damage. This catches the
 *      Mozilla-UA-spoofing scrapers that walked past our UA filter.
 *   2. Known-bad UA block. The polite "I'm a bot" tells. Most named
 *      bots (GPTBot, ClaudeBot, AhrefsBot, …) declare themselves;
 *      block the lot before they spend an MB-queue slot.
 *   3. Per-IP page rate limit (120/min, sliding window). A real user
 *      browsing 4-5 tabs in a burst doesn't trip it; a crawler
 *      walking the catalog gets cut off within the first minute.
 *      Backed by Upstash Redis so the budget is shared across all
 *      Vercel instances.
 */
// IMPORTANT: do NOT add "FacebookBot" or "facebookexternalhit" here.
// Both names get used by Meta's link-preview scraper — the thing that
// generates the OG / Twitter card unfurl on Threads / IG / FB / Messenger.
// Blocking either one = no preview cards across the entire Meta family.
// `Meta-ExternalAgent` is the right token for Meta's AI training
// crawler, which is the one we actually want to keep out.
const BLOCKED_UA =
  /(GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-Web|anthropic-ai|CCBot|PerplexityBot|Google-Extended|Applebot-Extended|Bytespider|Amazonbot|Meta-ExternalAgent|DuckAssistBot|Diffbot|AhrefsBot|SemrushBot|MJ12bot|DotBot|PetalBot|DataForSeoBot|BLEXBot|SeekportBot|Barkrowler)/i;

/**
 * Link-preview crawlers we ALWAYS let through, regardless of the
 * ASN block or per-IP rate limit. Pasting an Achordion URL into
 * Threads / Discord / Slack / Bluesky / Twitter triggers a one-
 * off scrape from the platform's IP range — those ranges
 * sometimes overlap our datacenter ASN block (Meta's Sharing
 * Debugger has been observed using AWS-routed IPs), which would
 * otherwise return 403 and break the unfurl.
 *
 * Matches the same set we allow in `app/robots.ts`. Order doesn't
 * matter — the regex match is constant-time on UA length.
 */
const ALLOWLIST_UA =
  /(facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot-LinkExpanding|Slackbot|Discordbot|Bluesky Cardyb|Mastodon|WhatsApp|TelegramBot|Pinterest|redditbot)/i;

/**
 * AS numbers (without the "AS" prefix) of cloud providers + bot
 * hosting infrastructure. Real residential / mobile ISP traffic
 * never originates from these.
 *
 * Sources: ASN registries + the empirical bot-UA spread on this
 * project's logs. Conservative additions only — when in doubt,
 * leave it off the list. False positives (a real user) hurt more
 * than false negatives (one more bot slipping through) since rate
 * limiting catches the rest.
 */
const BLOCKED_ASNS = new Set([
  "16509", // Amazon AWS
  "14618", // Amazon AWS US-EAST-1
  "15169", // Google
  "396982", // Google Cloud
  "8075", // Microsoft Azure
  "8068", // Microsoft (other)
  "14061", // DigitalOcean
  "24940", // Hetzner
  "16276", // OVH
  "12876", // Online SAS / Scaleway
  "63949", // Linode (Akamai-owned)
  "20473", // Choopa / Vultr
  "31898", // Oracle Cloud
  "212238", // Datacamp / CDN77 — heavy bot infra
  "9009", // M247 — chronic bot/proxy hosting
  "46562", // Performive — bot-hosting
  "8100", // QuadraNet
  "211252", // Aeza Group — proxy-heavy
  "215503", // Global Internet Solutions
  "200651", // FlyServers — proxy-heavy
  "62240", // Clouvider
  "133752", // LeaseWeb Asia Pacific
  "60781", // LeaseWeb Netherlands
  "30633", // LeaseWeb USA
  "58061", // ServerHouse / Scalaxy
  "39570", // Hostkey BV
  "29802", // HVC (cloud)
  "208046", // ColoCrossing-related
  "53667", // FranTech / BuyVM
]);

export async function middleware(request: NextRequest) {
  const ua = request.headers.get("user-agent") ?? "";

  // 0. Link-preview UA allowlist — short-circuit BEFORE ASN /
  //    UA-block / rate-limit checks. These bots scrape one URL
  //    on a paste, not the whole catalog, so the rate-limit
  //    concern doesn't apply; and they sometimes route through
  //    datacenter IPs that overlap our BLOCKED_ASNS, which
  //    would have otherwise 403'd them and broken every Threads
  //    / Discord / Slack preview card.
  if (ALLOWLIST_UA.test(ua)) {
    return NextResponse.next();
  }

  // 1. ASN block.
  const asn = request.headers.get("x-vercel-ip-asn") ?? "";
  if (asn && BLOCKED_ASNS.has(asn)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // 2. UA block.
  if (BLOCKED_UA.test(ua)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // 3. Per-IP page rate limit. Skip when the limiter isn't configured
  // (local dev, no Upstash env vars) — `checkRateLimit` returns
  // `{ ok: true }` in that case.
  //
  // Skip rate-limiting for Next router prefetches. They're fired on
  // link hover (and inside the in-app router at scroll time) and
  // double the request count without representing real user intent.
  // Each one would cost ~3-4 Redis ops via the sliding-window
  // limiter; that was a meaningful chunk of total Upstash command
  // consumption. The actual page click that follows still goes
  // through the limiter, so abuse cases (a crawler hitting URLs
  // directly) stay covered.
  const isPrefetch =
    request.headers.get("next-router-prefetch") === "1" ||
    request.headers.get("rsc") === "1" ||
    request.headers.get("purpose") === "prefetch";
  if (!isPrefetch) {
    // Defense-in-depth: never let the rate-limit path throw out of
    // middleware. An uncaught throw here crashes the middleware
    // invocation and Vercel serves a 503 for the page — a far worse
    // outcome than skipping the limit. `checkRateLimit` already fails
    // open internally; this catch is the belt to that suspenders.
    try {
      const rl = await checkRateLimit("page", request);
      if (!rl.ok) {
        return rateLimitedResponse();
      }
    } catch (err) {
      console.error("[middleware] rate-limit check failed — allowing:", err);
    }
  }

  return NextResponse.next();
}

/**
 * Render a styled HTML 429 instead of plaintext "Too Many Requests".
 *
 * The middleware short-circuits before Next's routing, so the app's
 * `error.tsx` boundary never sees this — we have to ship a complete
 * HTML document ourselves. Kept minimal (inline styles, no JS) so it
 * works the same in edge runtime as it would on any static host.
 *
 * Copy parity with `app/(app)/error.tsx` for the upstream-rate-limit
 * page so users see consistent framing whether the rate-limit is on
 * MB / LB (upstream) or on Achordion's per-IP middleware (here).
 */
function rateLimitedResponse(): NextResponse {
  const body = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Slow down a sec · Achordion</title>
<style>
  :root { color-scheme: dark light; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    background: #0a0a0a;
    color: #fafafa;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  main {
    max-width: 640px;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
  .eyebrow {
    font-size: 14px;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: #a3a3a3;
  }
  h1 {
    font-size: clamp(28px, 5vw, 40px);
    line-height: 1.1;
    margin: 0;
    letter-spacing: -0.5px;
  }
  p { margin: 0; color: #a3a3a3; line-height: 1.5; }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
  }
  a.btn, button.btn {
    display: inline-flex;
    align-items: center;
    padding: 8px 14px;
    border-radius: 8px;
    text-decoration: none;
    font-size: 14px;
    cursor: pointer;
    border: 1px solid transparent;
    background: #7c3aed;
    color: white;
    font-family: inherit;
  }
  a.btn.outline, button.btn.outline {
    background: transparent;
    border-color: rgba(255, 255, 255, 0.2);
    color: inherit;
  }
  a.btn:hover, button.btn:hover { opacity: 0.9; }
  @media (prefers-color-scheme: light) {
    body { background: #fafafa; color: #0a0a0a; }
    p, .eyebrow { color: #525252; }
    a.btn.outline, button.btn.outline { border-color: rgba(0, 0, 0, 0.15); }
  }
</style>
</head>
<body>
<main>
  <p class="eyebrow">Slow down a sec</p>
  <h1>You're hitting Achordion a little faster than we can serve.</h1>
  <p>
    Our per-IP rate limiter just kicked in. This usually clears in
    under a minute — try again shortly. If you keep seeing this on a
    normal click, let us know on
    <a href="https://achordion.fider.io/" style="color:inherit;text-decoration:underline;text-underline-offset:4px;">Fider</a>.
  </p>
  <div class="actions">
    <button class="btn" onclick="location.reload()">Try again</button>
    <a class="btn outline" href="/">Back to home</a>
  </div>
</main>
</body>
</html>`;
  return new NextResponse(body, {
    status: 429,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Retry-After": "60",
    },
  });
}

export const config = {
  // Skip Next internals + static assets — no point bot-checking every
  // chunk fetch, and we don't want to rate-limit a real user out of
  // their own page-data fetches. Page routes + /api routes only.
  matcher: [
    "/((?!_next/static|_next/image|_next/data|favicon.ico|icon.svg|robots.txt|parachord-hero.png).*)",
  ],
};
