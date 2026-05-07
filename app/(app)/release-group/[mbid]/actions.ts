"use server";

import { revalidatePath, updateTag } from "next/cache";
import { auth } from "@/auth";
import { isFeatureEnabled } from "@/lib/flags";
import { getCbTokens } from "@/lib/cb-token";
import {
  CB_REVIEW_MAX_CHARS,
  CB_REVIEW_MIN_CHARS,
  submitReleaseGroupReview,
} from "@/lib/clients/critiquebrainz";

export type SubmitReviewState =
  | { status: "idle" }
  | { status: "success"; reviewUrl: string }
  | { status: "error"; message: string; reconnect?: boolean };

const MBID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function submitReviewAction(
  _prev: SubmitReviewState,
  formData: FormData,
): Promise<SubmitReviewState> {
  const session = await auth();
  const user = session?.user?.mbUsername;
  if (!user) {
    return { status: "error", message: "Sign in to write a review." };
  }

  if (!(await isFeatureEnabled("write_reviews", user))) {
    // Same generic copy as the gated UI shows — don't leak that the
    // flag exists to users who shouldn't see it.
    return { status: "error", message: "This feature isn't available." };
  }

  const mbid = String(formData.get("mbid") ?? "").trim();
  const text = String(formData.get("text") ?? "").trim();
  const ratingRaw = String(formData.get("rating") ?? "").trim();

  if (!MBID_RE.test(mbid)) {
    return { status: "error", message: "Invalid album." };
  }
  if (text.length < CB_REVIEW_MIN_CHARS) {
    return {
      status: "error",
      message: `Reviews must be at least ${CB_REVIEW_MIN_CHARS} characters (you have ${text.length}).`,
    };
  }
  if (text.length > CB_REVIEW_MAX_CHARS) {
    return {
      status: "error",
      message: `Reviews can be at most ${CB_REVIEW_MAX_CHARS} characters.`,
    };
  }

  const rating =
    ratingRaw && /^[1-5]$/.test(ratingRaw) ? Number(ratingRaw) : null;

  const tokens = await getCbTokens();
  if (!tokens) {
    return {
      status: "error",
      message: "Connect CritiqueBrainz to publish your review.",
      reconnect: true,
    };
  }
  if (tokens.expiresAt && tokens.expiresAt < Date.now()) {
    return {
      status: "error",
      message: "Your CritiqueBrainz session expired. Reconnect to continue.",
      reconnect: true,
    };
  }

  const result = await submitReleaseGroupReview({
    accessToken: tokens.accessToken,
    mbid,
    text,
    rating,
  });

  if (!result.ok) {
    switch (result.error.kind) {
      case "unauthorized":
        return {
          status: "error",
          message: "Your CritiqueBrainz session expired. Reconnect to continue.",
          reconnect: true,
        };
      case "duplicate":
        return {
          status: "error",
          message: "You've already reviewed this album on CritiqueBrainz.",
        };
      case "validation":
        return { status: "error", message: result.error.message };
      case "server":
        return {
          status: "error",
          message: result.error.message,
        };
    }
  }

  // updateTag (Next 16) — read-your-own-writes for the cached
  // CB-reviews fetch keyed on this MBID. The page re-renders with
  // the freshly-published review visible.
  updateTag(`cb:rg:${mbid}`);
  revalidatePath(`/release-group/${mbid}`);
  return { status: "success", reviewUrl: result.data.url };
}
