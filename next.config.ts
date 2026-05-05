import type { NextConfig } from "next";

/**
 * Baseline security headers applied to every route. Kept narrow on
 * purpose — a maximalist CSP would risk breaking Next's inline boot
 * scripts and Tailwind's runtime class injection, so we lead with the
 * cheap-and-safe wins (clickjacking defense, MIME sniffing, referrer
 * policy, HSTS) and leave a real `Content-Security-Policy` with
 * `script-src` / `connect-src` allowlists as a separate, iterative
 * pass once we've got DevTools open against the deployed site.
 *
 * `frame-ancestors 'self'` (via CSP) is the modern replacement for
 * `X-Frame-Options`; we set both for compatibility with older
 * browsers / agents that haven't picked up the CSP directive.
 */
const SECURITY_HEADERS = [
  // Modern clickjacking defense. CSP `frame-ancestors` supersedes XFO
  // but XFO is still honored by some embedded webviews.
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
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
