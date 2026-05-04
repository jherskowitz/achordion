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

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Apply to every path. Next will merge these with route-
        // specific headers set via `response.headers.set(...)` in
        // route handlers (e.g. /api/track-cover's Cache-Control).
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
  images: {
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
