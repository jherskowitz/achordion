import "server-only";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

import { z } from "zod";

/**
 * fanart.tv music client. Used as a fallback for artist images when
 * the Wikidata `P18` claim doesn't have a usable photo — fanart.tv's
 * editor-curated `artistthumb` covers a different (and more pop-music
 * skewed) population than Wikidata.
 *
 * Auth: project API key via `api_key=` query param. Set
 * `FANART_API_KEY` in the environment; without it, every call returns
 * null so the rest of the app degrades gracefully back to Wikidata-
 * only / DiceBear placeholders.
 *
 * Identifier: MusicBrainz artist MBID (matches our existing lookup
 * key everywhere).
 *
 * Endpoint: `https://webservice.fanart.tv/v3/music/{MBID}`.
 *
 * License / ToS: must credit fanart.tv with a link-back when displaying
 * their imagery. The artist page surfaces this as an "fanart.tv"
 * "Other Links" entry whenever an image came from this source — see
 * `app/(app)/artist/[mbid]/page.tsx`.
 *
 * Cached weekly via Next's data cache. Editor approvals don't change
 * on the timescale of a user reload, and the API rate-limits free
 * project keys if hit too fast.
 */

const ENDPOINT = "https://webservice.fanart.tv/v3/music";

// Many fields are optional — fanart.tv returns only what's on file
// for a given artist. We only need `artistthumb[0].url` for now;
// `artistbackground` is here too in case we want hero backdrops later.
const ImageItemSchema = z
  .object({
    id: z.string().optional(),
    url: z.string().url().optional(),
    likes: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

const FanartArtistSchema = z
  .object({
    name: z.string().optional(),
    mbid_id: z.string().optional(),
    artistthumb: z.array(ImageItemSchema).optional(),
    artistbackground: z.array(ImageItemSchema).optional(),
    hdmusiclogo: z.array(ImageItemSchema).optional(),
    musiclogo: z.array(ImageItemSchema).optional(),
  })
  .passthrough();

/**
 * Resolve an MB artist MBID to a `artistthumb` URL from fanart.tv.
 * Returns null when fanart has no image, the API key isn't set, or
 * the call errors. Cached weekly per-MBID.
 */
export async function getArtistImageFromFanart(
  mbid: string,
): Promise<string | null> {
  const apiKey = process.env.FANART_API_KEY;
  if (!apiKey) return null;
  if (!mbid) return null;
  try {
    const url = `${ENDPOINT}/${encodeURIComponent(mbid)}?api_key=${encodeURIComponent(apiKey)}`;
    // 6-hour cache TTL is a compromise between two opposing forces:
    //   - approved images on fanart almost never change, so a longer
    //     cache would cost nothing for the steady-state hit path.
    //   - new editor approvals lag both fanart's API (non-VIP keys
    //     run ~2 days behind) AND any cached null we stored before
    //     the image was approved. A long TTL means a freshly-added
    //     thumb might not show up in our app for a week.
    // 6 hours puts the worst-case "approved but not yet visible" gap
    // at half a workday. Cache-tag-based revalidation could cut that
    // further if we ever want a manual refresh path.
    const res = await fetchWithTimeout(url, {
      headers: { Accept: "application/json" },
      next: {
        revalidate: 60 * 60 * 6,
        tags: [`fanart-artist:${mbid}`],
      },
    });
    if (!res.ok) return null;
    const data = FanartArtistSchema.parse(await res.json());
    // Sort `artistthumb` by `likes` desc when available — fanart
    // returns the highest-voted variant first by default but a defensive
    // sort guards against API ordering changes. Fall back to the raw
    // first entry if `likes` isn't present.
    const thumbs = (data.artistthumb ?? [])
      .filter((t) => typeof t.url === "string" && t.url.length > 0)
      .sort((a, b) => {
        const la = typeof a.likes === "number" ? a.likes : Number(a.likes ?? 0);
        const lb = typeof b.likes === "number" ? b.likes : Number(b.likes ?? 0);
        return lb - la;
      });
    return thumbs[0]?.url ?? null;
  } catch {
    return null;
  }
}

/**
 * Public fanart.tv artist page URL — used as the attribution link in
 * the artist page's "Other Links" sidebar whenever we render a fanart-
 * supplied image. The MBID is the only required path segment; their
 * router resolves the artist name client-side.
 */
export function fanartArtistUrl(mbid: string): string {
  return `https://fanart.tv/artist/${encodeURIComponent(mbid)}`;
}
