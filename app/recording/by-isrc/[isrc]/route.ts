import { lookupRecordingMbidByIsrc } from "@/lib/clients/musicbrainz";

// 2-letter country + 3-char registrant + 7 digits (year + serial).
const ISRC_RE = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;

/**
 * Resolve an ISRC to a recording MBID and 302 to /recording/<mbid>.
 *
 * Click-time resolution mirroring /recording/lookup, but keyed on an
 * ISRC — an *exact* recording identifier, so it lands on the right
 * recording with none of the wrong-variant risk the artist/title
 * fuzzy search carries. Lets a surface that has an ISRC but no MBID
 * (a scrobble ListenBrainz never mapped, a streaming-resolved track)
 * link to the exact recording page instead of a search URL. Deferred
 * to click time so it doesn't spend MB's 1 req/sec budget at render.
 *
 * Graceful fallback chain on a malformed / unresolvable ISRC: the
 * optional `?artist=&title=` query params let us drop to the
 * artist/title lookup (which itself falls back to /search), so the
 * user always lands somewhere useful.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ isrc: string }> },
) {
  const { isrc: rawIsrc } = await params;
  const url = new URL(request.url);
  const isrc = decodeURIComponent(rawIsrc ?? "")
    .trim()
    .toUpperCase();
  const artist = url.searchParams.get("artist")?.trim() ?? "";
  const title = url.searchParams.get("title")?.trim() ?? "";

  if (ISRC_RE.test(isrc)) {
    try {
      const mbid = await lookupRecordingMbidByIsrc(isrc);
      if (mbid) {
        return Response.redirect(
          new URL(`/recording/${mbid}`, request.url),
          302,
        );
      }
    } catch {
      /* fall through to the artist/title / search fallback */
    }
  }

  // ISRC didn't resolve — fall back to the fuzzy lookup when we have a
  // name to search, else straight to search.
  if (artist && title) {
    const p = new URLSearchParams({ artist, title });
    return Response.redirect(
      new URL(`/recording/lookup?${p}`, request.url),
      302,
    );
  }
  const q = [artist, title].filter(Boolean).join(" ") || isrc;
  return Response.redirect(
    new URL(q ? `/search?q=${encodeURIComponent(q)}` : "/search", request.url),
    302,
  );
}
