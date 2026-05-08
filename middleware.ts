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
  // 1. ASN block.
  const asn = request.headers.get("x-vercel-ip-asn") ?? "";
  if (asn && BLOCKED_ASNS.has(asn)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // 2. UA block.
  const ua = request.headers.get("user-agent") ?? "";
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
    const rl = await checkRateLimit("page", request);
    if (!rl.ok) {
      return new NextResponse("Too Many Requests", {
        status: 429,
        headers: { "Retry-After": "60" },
      });
    }
  }

  return NextResponse.next();
}

export const config = {
  // Skip Next internals + static assets — no point bot-checking every
  // chunk fetch, and we don't want to rate-limit a real user out of
  // their own page-data fetches. Page routes + /api routes only.
  matcher: [
    "/((?!_next/static|_next/image|_next/data|favicon.ico|icon.svg|robots.txt|parachord-hero.png).*)",
  ],
};
