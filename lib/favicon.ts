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
  let h = host.toLowerCase().trim();
  for (const rule of FAVICON_HOST_REWRITES) {
    if (rule.match.test(h)) return rule.canonical;
  }
  // Google s2 resolves favicons by the EXACT domain passed: `deezer.com`
  // returns the real logo (200) while `www.deezer.com` 404s to a generic
  // globe. Stored hosts arrive in both forms depending on the resolver
  // path (Odesli → `deezer.com`; the Deezer-by-ISRC seed → the API's
  // `www.deezer.com`), so strip the variant prefix here to guarantee the
  // canonical service icon on every surface — including the server-
  // rendered rows (embed / playlist / pins) that don't canonicalise the
  // host before building the URL. Mirrors `canonicalHost` in lib/host.ts.
  h = h.replace(/^(?:www|m|mobile|open|play|listen)\./, "");
  return h;
}

/**
 * Convenience: full Google s2 favicon URL for a given host.
 * Defaults to `sz=64` since that's what every consumer asks for.
 */
export function faviconUrl(host: string, size = 64): string {
  return `https://www.google.com/s2/favicons?domain=${faviconHost(host)}&sz=${size}`;
}
