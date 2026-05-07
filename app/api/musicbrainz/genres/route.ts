import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * MB curated-genre list, served as a flat array of names for client-
 * side autocomplete on the tag-add input.
 *
 * MB doesn't expose a generic "tag search" endpoint — tags are open
 * vocabulary, anyone can submit anything. But MB DOES maintain a
 * curated subset called "genres" (~500 entries) at
 * `/ws/2/genre/all?fmt=json`. That subset covers ~95% of what users
 * actually want to type when classifying an artist/album/recording,
 * so it's a useful autocomplete vocabulary even though the tag input
 * remains free-form (a user can submit "post-glitch" even if not in
 * the list).
 *
 * Cached an hour at the edge + 24h in the browser; the curated list
 * grows by a handful of entries per year.
 */

export const dynamic = "force-static";
export const revalidate = 60 * 60 * 24; // 24h server cache

const GenreListSchema = z.object({
  genres: z
    .array(
      z
        .object({
          name: z.string(),
        })
        .passthrough(),
    )
    .optional(),
  // The endpoint sometimes returns the array under a different key
  // depending on JSON-LD vs JSON; permissive parsing covers both.
  "genre-list": z
    .array(
      z
        .object({
          name: z.string(),
        })
        .passthrough(),
    )
    .optional(),
});

const USER_AGENT = "Achordion/0.1 (jherskow@gmail.com)";

const CACHE_HEADERS: Record<string, string> = {
  "Cache-Control":
    "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
};

export async function GET(): Promise<NextResponse> {
  try {
    const res = await fetch(
      "https://musicbrainz.org/ws/2/genre/all?fmt=json&limit=1000",
      {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        next: {
          revalidate: 60 * 60 * 24 * 7,
          tags: ["mb-genres"],
        },
      },
    );
    if (!res.ok) {
      return NextResponse.json({ genres: [] }, { headers: CACHE_HEADERS });
    }
    const json = await res.json();
    const parsed = GenreListSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ genres: [] }, { headers: CACHE_HEADERS });
    }
    const list = parsed.data.genres ?? parsed.data["genre-list"] ?? [];
    const names = list
      .map((g) => g.name.toLowerCase())
      .filter((n, i, arr) => arr.indexOf(n) === i)
      .sort();
    return NextResponse.json({ genres: names }, { headers: CACHE_HEADERS });
  } catch {
    return NextResponse.json({ genres: [] }, { headers: CACHE_HEADERS });
  }
}
