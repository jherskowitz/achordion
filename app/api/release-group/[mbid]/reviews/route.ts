import { NextResponse, type NextRequest } from "next/server";
import {
  getReleaseGroup,
  getRelease,
  partitionArtistRelations,
  pickCanonicalRelease,
} from "@/lib/clients/musicbrainz";
import {
  getReleaseGroupReviews,
  type CritiqueBrainzReview,
} from "@/lib/clients/critiquebrainz";
import {
  findAlbumWikipediaUrl,
  getCriticalReception,
  type WikipediaCriticalReception,
} from "@/lib/clients/wikipedia";
import { getWikidataEnWikipediaUrl } from "@/lib/clients/wikidata";
import { isFeatureEnabledForViewer } from "@/lib/flags";
import { hasCbConnection } from "@/lib/cb-token";

/**
 * Per-user reviews payload for a release-group page.
 *
 * Pattern: this route exists so `/release-group/[mbid]` itself can stay
 * edge-cached (CDN-Cache-Control public, s-maxage=3600) and identical
 * across visitors. Auth-dependent content (Reviews) is rendered as a
 * client island that fetches this endpoint per-request — bypassing the
 * page-level shared cache entirely. Re-use this pattern when adding any
 * other auth-gated section to a CDN-cached route.
 *
 * The endpoint is uncached (`dynamic = "force-dynamic"`) and explicit
 * `Cache-Control: private, no-store` — never CDN-share a per-user
 * payload, even briefly.
 */

export const dynamic = "force-dynamic";

interface ReviewsPayload {
  canRead: boolean;
  canWrite: boolean;
  cbConnected: boolean;
  cbReviews: CritiqueBrainzReview[];
  reception: WikipediaCriticalReception | null;
}

const NO_STORE: Record<string, string> = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ mbid: string }> },
): Promise<NextResponse> {
  const { mbid } = await params;

  // Resolve flag state up front. When the viewer can do nothing,
  // short-circuit with an empty payload — the client renders nothing.
  const [canRead, canWrite] = await Promise.all([
    isFeatureEnabledForViewer("reviews"),
    isFeatureEnabledForViewer("write_reviews"),
  ]);
  if (!canRead && !canWrite) {
    const empty: ReviewsPayload = {
      canRead: false,
      canWrite: false,
      cbConnected: false,
      cbReviews: [],
      reception: null,
    };
    return NextResponse.json(empty, { headers: NO_STORE });
  }

  // Re-derive url-rels here rather than threading them through the
  // client island (which would defeat the cache split — we'd need to
  // SSR the page anyway to know them). Both calls are heavily cached
  // by the MB client so the typical cost is a JSON deserialize.
  let urls: ReturnType<typeof partitionArtistRelations>["urls"] = [];
  try {
    const rg = await getReleaseGroup(mbid);
    const canonical = pickCanonicalRelease(rg);
    const rgUrls = partitionArtistRelations(rg).urls;
    const release = canonical
      ? await getRelease(canonical.id).catch(() => null)
      : null;
    const releaseUrls = release
      ? partitionArtistRelations({ relations: release.relations }).urls
      : [];
    urls = Array.from(
      new Map([...rgUrls, ...releaseUrls].map((l) => [l.url, l])).values(),
    );
  } catch {
    // MB unreachable — degrade gracefully. We can still surface CB
    // reviews (mbid alone), and write affordances stay visible.
  }

  // Wikipedia URL: prefer a direct rel, fall back to resolving Wikidata
  // sitelinks → enwiki. Common case for albums (e.g. "In Rainbows":
  // wikidata-only rel).
  const directWikiUrl = findAlbumWikipediaUrl(urls);
  const wikidataUrl = !directWikiUrl
    ? urls.find((l) => /\/\/www\.wikidata\.org\/wiki\/Q\d+/i.test(l.url))
        ?.url ?? null
    : null;
  const wikipediaUrlPromise: Promise<string | null> = directWikiUrl
    ? Promise.resolve(directWikiUrl)
    : wikidataUrl
      ? getWikidataEnWikipediaUrl(wikidataUrl).catch(() => null)
      : Promise.resolve(null);

  const [cbReviews, wikipediaUrl, cbConnected] = await Promise.all([
    canRead
      ? getReleaseGroupReviews(mbid).catch(() => [] as CritiqueBrainzReview[])
      : Promise.resolve([] as CritiqueBrainzReview[]),
    canRead ? wikipediaUrlPromise : Promise.resolve(null),
    canWrite ? hasCbConnection() : Promise.resolve(false),
  ]);
  const reception = wikipediaUrl
    ? await getCriticalReception(wikipediaUrl).catch(() => null)
    : null;

  const payload: ReviewsPayload = {
    canRead,
    canWrite,
    cbConnected,
    cbReviews,
    reception,
  };
  return NextResponse.json(payload, { headers: NO_STORE });
}
