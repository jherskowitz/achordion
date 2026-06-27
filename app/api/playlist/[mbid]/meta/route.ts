import { NextResponse, type NextRequest } from "next/server";
import { getPlaylist } from "@/lib/clients/listenbrainz";
import { caaReleaseUrl } from "@/lib/clients/coverart";

/**
 * Public playlist metadata, as JSON — the share-card fields
 * (`title`, `description`, `image`, `type`) without the page-render
 * path.
 *
 * Why this exists: the `/playlist/<mbid>` *page* sits behind Vercel's
 * managed bot challenge (the edge returns 429 + `x-vercel-mitigated:
 * challenge` to any client that can't solve the JS challenge — which
 * includes server-side scrapers running from datacenter IPs). That
 * breaks parachord.com's Universal-Link landing pages, whose Worker
 * scrapes Achordion's OG tags to render the title / cover / blurb for
 * a shared playlist. `/api/*` routes are NOT challenged (verified:
 * `/api/playlist/<id>/preview` + `/xspf` return 200 to the same
 * datacenter UA the page 429s), so a JSON sibling here is reachable
 * with zero firewall config — and it's insulated from any future
 * change to the page-side anti-bot posture.
 *
 * The four fields mirror what `<meta property="og:*">` exposes on the
 * page:
 *   - `title` / `description` — byte-identical to the page's
 *     `generateMetadata` output.
 *   - `type` — always `music.playlist` (the page's `og:type`).
 *   - `image` — the playlist's representative cover: the first track
 *     carrying a release MBID, resolved to its Cover Art Archive URL
 *     (the same source the OG card's mosaic draws from). We return a
 *     deterministic CAA URL rather than echoing the page's dynamic
 *     `og:image`, whose Next content-hash (`opengraph-image-<hash>`)
 *     changes every deploy and would be fragile to reproduce. `null`
 *     when the playlist has no track with cover art.
 *
 * Privacy: unauthenticated `getPlaylist` returns 404 for private
 * playlists (LB hides them from tokenless callers), so this endpoint
 * only ever discloses metadata the playlist owner already made
 * public — same boundary the public OG card honors.
 */

interface RouteContext {
  params: Promise<{ mbid: string }>;
}

export interface PlaylistMetaResponse {
  title: string;
  description: string;
  image: string | null;
  type: "music.playlist";
}

export async function GET(
  _req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  const { mbid } = await ctx.params;
  if (!mbid) {
    return NextResponse.json({ error: "missing mbid" }, { status: 400 });
  }

  let data;
  try {
    // Unauthenticated → public playlists only. Private / nonexistent
    // both resolve to null (LB 404s tokenless callers on private), so
    // we never leak a private playlist's title or cover.
    data = await getPlaylist(mbid);
  } catch {
    return NextResponse.json(
      { error: "upstream fetch failed" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "playlist not found" },
      {
        status: 404,
        // Short public cache so a hammered missing/private id doesn't
        // re-hit LB on every scrape, but recovers quickly if the
        // playlist is later made public.
        headers: { "Cache-Control": "public, s-maxage=60" },
      },
    );
  }

  const trackCount = data.tracks.length;
  const trackLabel = `${trackCount} track${trackCount === 1 ? "" : "s"}`;
  // Identical formulas to the page's generateMetadata so the JSON and
  // the scraped OG tags never disagree.
  const title = data.creator
    ? `${data.title} by ${data.creator}`
    : data.title;
  const description = `${data.title}${data.creator ? ` by ${data.creator}` : ""} · ${trackLabel} · Achordion playlist.`;

  // Representative cover = first track with a release MBID. Prefer the
  // LB-supplied `caaReleaseMbid` (set when the track's primary release
  // lacks CAA art) over the bare release MBID — same precedence the OG
  // card uses.
  let image: string | null = null;
  for (const t of data.tracks) {
    const releaseMbid = t.caaReleaseMbid ?? t.releaseMbid;
    if (releaseMbid) {
      image = caaReleaseUrl(releaseMbid, 500);
      break;
    }
  }

  const payload: PlaylistMetaResponse = {
    title,
    description,
    image,
    type: "music.playlist",
  };

  return NextResponse.json(payload, {
    // Public, CDN-cacheable — the metadata changes only on edit, which
    // busts this path via `bustCache` in the playlist server actions.
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
