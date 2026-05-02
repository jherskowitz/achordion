"use server";

import { revalidateTag } from "next/cache";
import { auth } from "@/auth";
import { getLbTokenForRequest } from "@/lib/lb-token";
import { followUser, unfollowUser } from "@/lib/clients/listenbrainz";

export type FollowResult =
  | { ok: true }
  | { ok: false; reason: string };

async function setFollow(
  target: string,
  follow: boolean,
): Promise<FollowResult> {
  const session = await auth();
  const viewer = session?.user?.mbUsername;
  if (!viewer) return { ok: false, reason: "Sign in to follow." };
  if (viewer.toLowerCase() === target.toLowerCase()) {
    return { ok: false, reason: "You can't follow yourself." };
  }
  const token = await getLbTokenForRequest();
  if (!token) {
    return {
      ok: false,
      reason: "Add your ListenBrainz token in /settings/connections.",
    };
  }
  const result = follow
    ? await followUser(target, token)
    : await unfollowUser(target, token);
  if (!result.ok) {
    return {
      ok: false,
      reason:
        result.message ?? `ListenBrainz returned ${result.status}.`,
    };
  }
  // Invalidate the viewer's following cache so the toggle flips on
  // next render.
  revalidateTag(`lb:user:${viewer}:following`, "max");
  revalidateTag(`lb:user:${target}:followers`, "max");
  return { ok: true };
}

export async function followUserAction(target: string): Promise<FollowResult> {
  return setFollow(target, true);
}

export async function unfollowUserAction(
  target: string,
): Promise<FollowResult> {
  return setFollow(target, false);
}
