/**
 * Favicon-host normalization. Some services use per-artist or
 * per-tenant subdomains (notably Bandcamp: every artist gets
 * `<name>.bandcamp.com`) where Google's s2 favicon endpoint will
 * happily return whatever the subdomain serves — sometimes a
 * custom artist mark, sometimes the default globe when nothing's
 * set, almost never the canonical Bandcamp orange dot. We want
 * one consistent favicon per service across the whole site.
 *
 * Resolved hosts in our data model already canonicalise common
 * www / m / open prefixes (see `canonicalHost` in
 * lib/track-links-store.ts) but those rules deliberately leave
 * `*.bandcamp.com` alone — that's a deduplication concern, not
 * an icon-display one. This helper is the display-only flip side:
 * stored host stays as-is, but the favicon URL we build always
 * targets the canonical service domain.
 */

const FAVICON_HOST_REWRITES: Array<{ match: RegExp; canonical: string }> = [
  // `<artist>.bandcamp.com` → `bandcamp.com`. Catches the apex and
  // any subdomain depth (`shop.<artist>.bandcamp.com` etc.).
  { match: /(?:^|\.)bandcamp\.com$/i, canonical: "bandcamp.com" },
];

/**
 * Map a host string to the host we should use for favicon lookup.
 * Falls through to the original host when no rewrite rule applies.
 */
export function faviconHost(host: string): string {
  const h = host.toLowerCase().trim();
  for (const rule of FAVICON_HOST_REWRITES) {
    if (rule.match.test(h)) return rule.canonical;
  }
  return h;
}

/**
 * Convenience: full Google s2 favicon URL for a given host.
 * Defaults to `sz=64` since that's what every consumer asks for.
 */
export function faviconUrl(host: string, size = 64): string {
  return `https://www.google.com/s2/favicons?domain=${faviconHost(host)}&sz=${size}`;
}
