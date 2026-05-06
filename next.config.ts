import type { NextConfig } from "next";

/**
 * Full Content-Security-Policy allowlist (`#4`). Two headers:
 *   1. Enforcing CSP carries only `frame-ancestors 'self'` — the
 *      modern clickjacking defense already in place. Everything
 *      else stays in report-only mode for now.
 *   2. Report-Only CSP carries the full directive set below
 *      (script-src / style-src / connect-src / img-src / font-src /
 *      base-uri / form-action / object-src / upgrade-insecure-
 *      requests). Browsers log violations to the console but
 *      don't block, which is the right posture for the "deploy,
 *      walk every major route, tighten" iteration loop the issue
 *      describes.
 *
 * Once a Vercel preview round-trip shows the report-only header
 * clean across the major surfaces (/, /explore, /charts, /radio,
 * /artist/{mbid}, /release-group/{mbid}, /user/{name}, /search,
 * /settings, /login, /faq, /about, /donate), promote the directive
 * set to the enforcing header and remove the report-only one.
 *
 * Allowlist contents are inventoried from the codebase: every
 * external host the app intentionally talks to lives below. When
 * adding a new third-party API / image source / favicon CDN,
 * extend the right directive here too — otherwise the eventual
 * enforcing flip will silently drop those requests.
 */
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  // 'unsafe-inline' covers Next 16 inline boot scripts; 'unsafe-eval'
  // covers Turbopack/webpack dev runtimes (no-op effect in prod since
  // bundled output doesn't eval). Vercel telemetry script lives at
  // va.vercel-scripts.com.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com",
  // Tailwind v4 + Radix style props inject runtime inline styles.
  "style-src 'self' 'unsafe-inline'",
  // Fonts: Geist comes via next/font (served from /_next/static, so
  // covered by 'self'); data: covers any inlined fallback metrics.
  "font-src 'self' data:",
  // Image hosts the app actually fetches from. Mirrors next.config
  // remotePatterns + favicons (Google s2) + Wikidata photos
  // (upload.wikimedia.org) + DiceBear avatars + Spinbin station
  // logos. data: + blob: cover dynamic SVG / canvas-derived URLs.
  "img-src 'self' data: blob: https://archive.org https://*.archive.org https://coverartarchive.org https://musicbrainz.org https://gravatar.com https://api.dicebear.com https://upload.wikimedia.org https://www.google.com https://jherskowitz.github.io",
  // Same-origin XHR / fetch / WS plus every external API the
  // server-side code reaches through the browser at any point. The
  // bulk are server-only (LB, MB, Wikidata, Odesli, RSS feeds, Earshot)
  // and don't strictly need to be allowlisted here — but the LB Radio
  // Mode-C-inline `refill` URL is hit FROM Parachord, and DiceBear
  // avatars + s2 favicons are loaded by the browser. Keep the list
  // permissive on the API hosts so a future client-side fetch doesn't
  // get blocked.
  "connect-src 'self' https://api.listenbrainz.org https://labs.api.listenbrainz.org https://listenbrainz.org https://musicbrainz.org https://api.musicbrainz.org https://www.wikidata.org https://en.wikipedia.org https://commons.wikimedia.org https://upload.wikimedia.org https://api.dicebear.com https://api.song.link https://archive.org https://*.archive.org https://coverartarchive.org https://rss.applemarketingtools.com https://www.earshot-online.com https://jherskowitz.github.io https://va.vercel-scripts.com https://vitals.vercel-insights.com",
  // Iframe whitelist — empty for now since we don't embed anything,
  // but keeping `frame-src 'none'` would block any future LB review
  // embed without warning. Allow same-origin only.
  "frame-src 'self'",
  "frame-ancestors 'self'",
  // No <object>/<embed>/<applet>; closes a small XSS surface.
  "object-src 'none'",
  // Pin form posts to same origin (pairs with the existing referrer
  // policy and base-uri).
  "base-uri 'self'",
  "form-action 'self'",
  // Browsers retry http subresources over https when this is set —
  // safety net for any URL that might have slipped through with a
  // bare http scheme. Vercel terminates TLS for every request anyway.
  "upgrade-insecure-requests",
].join("; ");

const SECURITY_HEADERS = [
  // Modern clickjacking defense. CSP `frame-ancestors` supersedes XFO
  // but XFO is still honored by some embedded webviews.
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  // Report-Only CSP — browsers log violations against this header
  // without blocking. Once preview-walk shows the console clean,
  // promote `value` to the enforcing `Content-Security-Policy` and
  // drop the report-only header in the same change.
  { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Disable MIME-type sniffing so a CSS / image response can't be
  // re-interpreted as JS by a permissive browser.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Strip the path/query from referrers leaving the site, but keep
  // the origin so MetaBrainz / favicon CDNs still get traffic
  // attribution. Strictest policy that doesn't break analytics.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Lock off browser features Achordion has no business asking for.
  // Anything not in the list is allowed by default; anything listed
  // with `=()` is blocked outright.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  // 2-year HSTS with subdomains + preload-eligible. Vercel terminates
  // TLS so this is safe to advertise; the preload flag lets us submit
  // to hstspreload.org once we're sure we'll never serve the apex
  // over plain HTTP again.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

/**
 * Cache-Control for static assets that don't change without a deploy.
 *
 * Vercel's default Cache-Control on responses that don't set their
 * own is `public, max-age=0, must-revalidate` — which forces the
 * browser to re-validate every static image / SVG / favicon on every
 * page load. Lots of needless conditional GETs, slower reloads, and
 * a steady stream of `<img>` re-downloads when the ETag changes.
 *
 * `immutable` is safe for files whose URL contains a content hash
 * (Next bundles, optimized images via `/_next/image` with width+
 * quality params encoded in the URL). For top-level public assets
 * the URL is stable but the file CAN change between deploys, so we
 * use a 1-day max-age + must-revalidate (browser revalidates with
 * an If-None-Match every 24h, gets a fast 304 if unchanged).
 */
const STATIC_ASSET_CACHE = {
  key: "Cache-Control",
  value: "public, max-age=86400, must-revalidate",
};

const IMMUTABLE_ASSET_CACHE = {
  key: "Cache-Control",
  value: "public, max-age=31536000, immutable",
};

/**
 * Edge-cache directives for public entity-detail routes (artist,
 * release-group, release, recording, tag) and charts/static pages.
 * Same content for everyone — no per-user state in the rendered
 * HTML — so the edge can serve a single cached response to every
 * visitor for 1 hour, then refresh in the background while still
 * serving stale for up to 24h.
 *
 * **Why `CDN-Cache-Control` instead of plain `Cache-Control`**:
 * Next.js overrides plain `Cache-Control` to `private, no-cache,
 * no-store` for any route it considers dynamically rendered (which
 * includes anything reading `searchParams`, cookies, or headers
 * server-side — `/artist/[mbid]` reads `?type=` to filter the
 * discography, so it's dynamic by Next's reckoning). Setting
 * `Cache-Control` via headers() doesn't survive that override.
 *
 * `CDN-Cache-Control` is the standard CDN-only header that Next
 * does NOT touch. Vercel's edge respects it for the cache decision
 * regardless of what `Cache-Control` says. So:
 *
 *   - Browser sees: whatever Next sets (private, no-cache for
 *     dynamic routes; means back/forward gets a fresh edge fetch).
 *   - Vercel edge sees: `public, s-maxage=3600, ...` — caches the
 *     SSR'd HTML for 1h, serves it to every other visitor in that
 *     window without re-rendering.
 *
 * Critical assumption: site-header auth state is now resolved
 * client-side via `useSession()` (see components/layout/site-header
 * .tsx), which means the SSR output is identical for every visitor
 * — no avatar, no "My Feed" / "My Profile" tabs. Logged-in users
 * get those slots filled in post-hydration via the shared session
 * cookie. If you ever add server-rendered auth-dependent content
 * to one of these routes, REMOVE its entry from this list before
 * shipping.
 */
const PUBLIC_ENTITY_CACHE = {
  key: "CDN-Cache-Control",
  value: "public, s-maxage=3600, stale-while-revalidate=86400",
};

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Security headers on every path.
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
      {
        // Next-fingerprinted bundles (JS / CSS / chunks) — the
        // filename includes a content hash, so a 1-year immutable
        // cache is safe. Without this every reload re-fetches the
        // bundle even though its URL hasn't changed.
        source: "/_next/static/:path*",
        headers: [IMMUTABLE_ASSET_CACHE],
      },
      {
        // Next image optimizer output. The output URL embeds the
        // source path + width + quality, so any change produces a
        // new URL. Cache aggressively.
        source: "/_next/image",
        headers: [IMMUTABLE_ASSET_CACHE],
      },
      {
        // Top-level public PNG / JPEG / SVG / favicon / OG image.
        // Filenames are stable across deploys but content can
        // change, so 1-day max-age with revalidation gives fast
        // reloads (cache hit) plus a same-day pickup of any update.
        source: "/:file(.*\\.(?:png|jpg|jpeg|webp|svg|ico|gif|avif))",
        headers: [STATIC_ASSET_CACHE],
      },
      // Public entity-detail routes. Each renders the same HTML for
      // every visitor (auth state lives client-side), so the edge
      // can share a single cached response across all visitors. See
      // PUBLIC_ENTITY_CACHE above for the trade-offs.
      {
        source: "/artist/:mbid",
        headers: [PUBLIC_ENTITY_CACHE],
      },
      {
        source: "/release-group/:mbid",
        headers: [PUBLIC_ENTITY_CACHE],
      },
      {
        source: "/release/:mbid",
        headers: [PUBLIC_ENTITY_CACHE],
      },
      {
        source: "/release/:mbid/:rest*",
        headers: [PUBLIC_ENTITY_CACHE],
      },
      {
        source: "/recording/:mbid",
        headers: [PUBLIC_ENTITY_CACHE],
      },
      {
        source: "/tag/:name",
        headers: [PUBLIC_ENTITY_CACHE],
      },
      // Charts pages are also public + identical for everyone.
      {
        source: "/charts",
        headers: [PUBLIC_ENTITY_CACHE],
      },
      {
        source: "/charts/:rest*",
        headers: [PUBLIC_ENTITY_CACHE],
      },
      // Static content pages (about, faq, donate, login).
      {
        source: "/about",
        headers: [PUBLIC_ENTITY_CACHE],
      },
      {
        source: "/faq",
        headers: [PUBLIC_ENTITY_CACHE],
      },
      {
        source: "/donate",
        headers: [PUBLIC_ENTITY_CACHE],
      },
      {
        source: "/apps",
        headers: [PUBLIC_ENTITY_CACHE],
      },
      {
        source: "/login",
        headers: [PUBLIC_ENTITY_CACHE],
      },
      {
        source: "/changelog",
        headers: [PUBLIC_ENTITY_CACHE],
      },
      {
        source: "/explore/critical-darlings",
        headers: [PUBLIC_ENTITY_CACHE],
      },
    ];
  },
  images: {
    // Default 60s is too short for our use — MB / Wikipedia / CAA
    // images don't churn on the timescale of a user reload, and
    // the Next image optimizer caches by URL anyway. 30 days
    // matches what cache-busting platforms like CAA expect.
    minimumCacheTTL: 60 * 60 * 24 * 30,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "coverartarchive.org",
      },
      {
        protocol: "https",
        hostname: "archive.org",
      },
      {
        protocol: "https",
        hostname: "ia.media-imager.archive.org",
      },
      {
        protocol: "https",
        hostname: "musicbrainz.org",
      },
      {
        protocol: "https",
        hostname: "gravatar.com",
      },
    ],
  },
};

export default nextConfig;
