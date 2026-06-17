import { z } from "zod";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

/**
 * Deezer's free, no-auth lookup of a track by ISRC
 * (`api.deezer.com/track/isrc:<isrc>`).
 *
 * Why we need it: most recordings carry an ISRC but have NO
 * MusicBrainz streaming url-rel, so the track-links resolver has
 * nothing to seed Odesli with and the favicon row comes up empty even
 * though the song is plainly on streaming. Deezer's ISRC endpoint
 * turns the ISRC into a concrete streaming URL for free — which both
 * renders as a Deezer link AND seeds Odesli for the full cross-service
 * set.
 *
 * Response is `{ id, title, link, … }` on a hit, `{ error: {…} }` on a
 * miss. Returns null on miss / not-found / Deezer unreachable, so
 * callers treat it as "no seed from here". Cached 24h per ISRC.
 */
const DeezerIsrcSchema = z.object({
  link: z.string().url().optional(),
  error: z.unknown().optional(),
});

export async function lookupDeezerUrlByIsrc(
  isrc: string,
): Promise<string | null> {
  if (!isrc) return null;
  try {
    const res = await fetchWithTimeout(
      `https://api.deezer.com/track/isrc:${encodeURIComponent(isrc)}`,
      {
        headers: { Accept: "application/json" },
        next: {
          revalidate: 60 * 60 * 24,
          tags: [`deezer:isrc:${isrc.toUpperCase()}`],
        },
      },
      6000,
    );
    if (!res.ok) return null;
    const parsed = DeezerIsrcSchema.safeParse(await res.json());
    if (!parsed.success || parsed.data.error || !parsed.data.link) return null;
    return parsed.data.link;
  } catch {
    return null;
  }
}
