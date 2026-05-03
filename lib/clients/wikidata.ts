import "server-only";

const USER_AGENT =
  "Achordion/0.1 (+https://github.com/jherskowitz/achordion)";

const QID_RE = /\/(Q\d+)\b/i;

/** Pull a Wikidata QID out of any of the URL forms MB stores. */
export function extractWikidataQid(
  url: string | undefined | null,
): string | null {
  if (!url) return null;
  const m = url.match(QID_RE);
  return m ? m[1].toUpperCase() : null;
}

interface WikidataClaim {
  mainsnak?: {
    datavalue?: {
      value?: unknown;
    };
  };
}

interface WikidataEntity {
  claims?: Record<string, WikidataClaim[] | undefined>;
}

interface WikidataResponse {
  entities?: Record<string, WikidataEntity | undefined>;
}

/**
 * Resolve a Wikidata QID to its `P18` (image) filename — that's the
 * Commons filename, NOT a URL. Returns null when the entity has no
 * P18 claim or we hit a network error.
 *
 * Cached for a week — artist photos basically never change, and
 * hammering Wikidata for the same QID on every artist-page render
 * isn't worth it.
 */
export async function getWikidataP18Filename(
  qid: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`,
      {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
        },
        next: {
          revalidate: 60 * 60 * 24 * 7,
          tags: [`wikidata:${qid}`],
        },
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as WikidataResponse;
    const entity = data?.entities?.[qid];
    const claims = entity?.claims?.P18;
    if (!Array.isArray(claims) || claims.length === 0) return null;
    const value = claims[0]?.mainsnak?.datavalue?.value;
    if (typeof value !== "string" || value.length === 0) return null;
    return value;
  } catch {
    return null;
  }
}

/**
 * Build a Wikimedia Commons URL for a `P18` filename. `Special:FilePath`
 * 302s to the actual image; the `width` query gives a server-side-
 * resized variant up to the original resolution.
 */
export function commonsImageUrl(filename: string, width = 512): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(
    filename,
  )}?width=${width}`;
}

/**
 * One-call helper: given a Wikidata URL (the form MB url-rels store),
 * return a Commons-hosted image URL or null. Used by ArtistAvatar.
 */
export async function getArtistImageFromWikidata(
  wikidataUrl: string | null | undefined,
  width = 512,
): Promise<string | null> {
  const qid = extractWikidataQid(wikidataUrl);
  if (!qid) return null;
  const filename = await getWikidataP18Filename(qid);
  if (!filename) return null;
  return commonsImageUrl(filename, width);
}
