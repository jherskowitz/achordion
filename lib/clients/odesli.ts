import { z } from "zod";

/**
 * Odesli (song.link / album.link) public API client.
 *
 * Why we use this: MusicBrainz `url-rels` for recordings are sparse —
 * a track might have a Spotify URL but no Apple Music / Tidal / YouTube
 * counterpart, or vice-versa. Odesli takes any one service URL and
 * returns the equivalent on every other major service, which lets us
 * render a complete "play this elsewhere" row of favicons on the track
 * page from whatever single URL MB happens to know about.
 *
 * Constraints we design around:
 *   - Free tier rate limit is 10 req/min per IP. We rely on Next.js
 *     fetch caching (revalidate: 1 day) to keep us well under that —
 *     the same track URL only ever resolves once per day.
 *   - The API does NOT accept a bare ISRC. Input must be either a
 *     service URL or a (platform, type, id) triple. The
 *     song.link/i/<isrc> redirect serves a 200 page for unindexed
 *     ISRCs (silently empty), so it isn't a useful fallback either —
 *     callers should just hide the row when no service URL is
 *     available.
 *   - Odesli intermittently 4xx/5xx for obscure tracks. All call sites
 *     should treat `null` as "no rich data, fall back to whatever you
 *     have".
 *
 * Docs: https://www.notion.so/odesli/Public-API-d8093b1bb35f4f3da6e19a8f5a288776
 */

const OdesliPlatformLinkSchema = z.object({
  url: z.string(),
  nativeAppUriMobile: z.string().optional(),
  nativeAppUriDesktop: z.string().optional(),
  entityUniqueId: z.string().optional(),
});

const OdesliResponseSchema = z.object({
  entityUniqueId: z.string(),
  userCountry: z.string(),
  pageUrl: z.string(),
  linksByPlatform: z.record(z.string(), OdesliPlatformLinkSchema),
});

export type OdesliResponse = z.infer<typeof OdesliResponseSchema>;
export type OdesliPlatformLink = z.infer<typeof OdesliPlatformLinkSchema>;

const ODESLI_BASE = "https://api.song.link/v1-alpha.1/links";

/**
 * Look up a song / album across all music services from a single
 * service URL. Returns null on any error or rate-limit so callers can
 * silently degrade to the original MB-supplied link list.
 *
 * Cached by Next's fetch layer for 24h — same `url` resolves once per
 * day across the whole deployment, which keeps us comfortably under
 * the 10-req-per-minute free-tier ceiling even on heavy traffic.
 */
export async function getOdesliLinks(
  url: string,
  opts: { userCountry?: string } = {},
): Promise<OdesliResponse | null> {
  const params = new URLSearchParams({
    url,
    userCountry: opts.userCountry ?? "US",
    songIfSingle: "true",
  });
  try {
    const res = await fetch(`${ODESLI_BASE}?${params}`, {
      // Hard timeout. Odesli is a free third-party service that
      // periodically goes slow / stops responding. Without an abort
      // the `await` hangs indefinitely — and because callers use
      // `getOdesliLinks(...).catch(() => null)`, the catch only rescues
      // a *rejection*, never a hang. A hung Odesli call therefore
      // wedged `resolveTrackLinks`, which is awaited inside the
      // `<PinnedExternalLinks>` / recording-page async server
      // components, leaving their Suspense boundaries stuck on the
      // favicon skeleton forever (observed: pinned-track + recording
      // favicon rows never resolving). AbortSignal.timeout turns the
      // hang into a throw the catch already handles → the resolver
      // degrades to MB-only links and the row resolves. Mirrors the
      // fetch timeouts on the MB and LB clients.
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 86400, tags: ["odesli"] },
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const parsed = OdesliResponseSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

