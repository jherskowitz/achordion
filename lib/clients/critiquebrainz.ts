import "server-only";

import { z } from "zod";

const CB_BASE = "https://critiquebrainz.org/ws/1";
const USER_AGENT = "Achordion/0.1 (jherskow@gmail.com)";

/**
 * CritiqueBrainz reviews — MetaBrainz's open review database, keyed
 * on the same release-group MBIDs we already use. Free, no auth.
 *
 * Coverage is sparse (most albums have zero reviews), so callers
 * should treat an empty array as the common case and degrade
 * gracefully (e.g. fall through to Wikipedia "Critical reception").
 */

const ReviewSchema = z
  .object({
    id: z.string(),
    text: z.string().nullable().optional(),
    rating: z.number().min(1).max(5).nullable().optional(),
    language: z.string().optional(),
    published_on: z.string().optional(),
    user: z
      .object({
        user_name: z.string().optional(),
      })
      .partial()
      .optional(),
  })
  .passthrough();

const ReviewListSchema = z
  .object({
    count: z.number().optional(),
    reviews: z.array(ReviewSchema).optional(),
  })
  .passthrough();

export interface CritiqueBrainzReview {
  id: string;
  text: string;
  rating: number | null;
  language: string | null;
  publishedOn: string | null;
  userName: string | null;
  url: string;
}

/**
 * Fetch published reviews for a release-group MBID. Sorted by
 * popularity (CB's default) so the strongest signal lands first.
 * Returns [] on any error — reviews are an enrichment, never a
 * critical render path.
 */
export async function getReleaseGroupReviews(
  mbid: string,
  limit = 5,
): Promise<CritiqueBrainzReview[]> {
  const url =
    `${CB_BASE}/review/` +
    `?entity_id=${encodeURIComponent(mbid)}` +
    `&entity_type=release_group` +
    `&sort=popularity` +
    `&limit=${limit}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      next: {
        revalidate: 60 * 60 * 24,
        tags: [`cb:rg:${mbid}`],
      },
    });
    if (!res.ok) return [];
    const data = ReviewListSchema.parse(await res.json());
    const reviews = data.reviews ?? [];
    return reviews
      .filter((r) => r.text && r.text.trim().length > 0)
      .map((r) => ({
        id: r.id,
        text: r.text!.trim(),
        rating: r.rating ?? null,
        language: r.language ?? null,
        publishedOn: r.published_on ?? null,
        userName: r.user?.user_name ?? null,
        url: `https://critiquebrainz.org/review/${r.id}`,
      }));
  } catch {
    return [];
  }
}
