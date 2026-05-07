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

// Review length + license constants live in a separate file so client
// components can import them without pulling in this server-only
// module. Re-exported here so existing server-side imports keep
// working without churn.
export {
  CB_REVIEW_MIN_CHARS,
  CB_REVIEW_MAX_CHARS,
  CB_DEFAULT_LICENSE,
} from "./critiquebrainz-constants";
import { CB_DEFAULT_LICENSE } from "./critiquebrainz-constants";

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

const CreateReviewResponseSchema = z
  .object({
    id: z.string(),
  })
  .passthrough();

export type SubmitReviewError =
  | { kind: "unauthorized" }
  | { kind: "duplicate" }
  | { kind: "validation"; message: string }
  | { kind: "server"; status: number; message: string };

export interface SubmitReviewSuccess {
  id: string;
  url: string;
}

/**
 * POST a new review to CritiqueBrainz for a release-group. The
 * caller is responsible for supplying a valid OAuth access token
 * obtained via `lib/auth/critiquebrainz.ts`'s `exchangeCode`.
 *
 * Returns a discriminated union so callers can distinguish the
 * "you need to reconnect" case from a "your review's too short"
 * validation error and surface different UX accordingly.
 */
export async function submitReleaseGroupReview(opts: {
  accessToken: string;
  mbid: string;
  text: string;
  rating?: number | null;
  language?: string;
  licenseChoice?: string;
}): Promise<{ ok: true; data: SubmitReviewSuccess } | { ok: false; error: SubmitReviewError }> {
  const body = {
    entity_id: opts.mbid,
    entity_type: "release_group" as const,
    text: opts.text,
    rating: opts.rating ?? null,
    language: opts.language ?? "en",
    license_choice: opts.licenseChoice ?? CB_DEFAULT_LICENSE,
  };

  let res: Response;
  try {
    res = await fetch(`${CB_BASE}/review/`, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.accessToken}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (err) {
    return {
      ok: false,
      error: {
        kind: "server",
        status: 0,
        message: err instanceof Error ? err.message : "Network error",
      },
    };
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: { kind: "unauthorized" } };
  }
  if (res.status === 409) {
    return { ok: false, error: { kind: "duplicate" } };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 400) {
      return {
        ok: false,
        error: {
          kind: "validation",
          message: extractErrorMessage(text) ?? "CritiqueBrainz rejected the review.",
        },
      };
    }
    return {
      ok: false,
      error: {
        kind: "server",
        status: res.status,
        message: extractErrorMessage(text) ?? `CritiqueBrainz returned ${res.status}.`,
      },
    };
  }

  try {
    const data = CreateReviewResponseSchema.parse(await res.json());
    return {
      ok: true,
      data: {
        id: data.id,
        url: `https://critiquebrainz.org/review/${data.id}`,
      },
    };
  } catch {
    return {
      ok: false,
      error: {
        kind: "server",
        status: res.status,
        message: "Couldn't parse CritiqueBrainz response.",
      },
    };
  }
}

function extractErrorMessage(body: string): string | null {
  if (!body) return null;
  try {
    const parsed = JSON.parse(body) as {
      message?: string;
      description?: string;
      error?: string;
    };
    return parsed.message ?? parsed.description ?? parsed.error ?? null;
  } catch {
    return null;
  }
}
