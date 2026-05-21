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
  // Every follow / unfollow logs one line to Vercel runtime logs so
  // future "I don't remember following them" reports are debuggable
  // — we get timestamp, viewer, target, intent (follow vs unfollow),
  // and the eventual result. The action runs only when the user
  // explicitly clicks the toggle, so log volume is bounded.
  const verb = follow ? "follow" : "unfollow";
  const session = await auth();
  const viewer = session?.user?.mbUsername;
  if (!viewer) {
    console.warn(`[follow-action] ${verb} rejected: no session target=${target}`);
    return { ok: false, reason: "Sign in to follow." };
  }
  if (viewer.toLowerCase() === target.toLowerCase()) {
    console.warn(
      `[follow-action] ${verb} rejected: self-target viewer=${viewer}`,
    );
    return { ok: false, reason: "You can't follow yourself." };
  }
  const token = await getLbTokenForRequest();
  if (!token) {
    console.warn(
      `[follow-action] ${verb} rejected: no LB token viewer=${viewer} target=${target}`,
    );
    return {
      ok: false,
      reason: "Add your ListenBrainz token in /settings/connections.",
    };
  }
  const result = follow
    ? await followUser(target, token)
    : await unfollowUser(target, token);
  if (!result.ok) {
    console.warn(
      `[follow-action] ${verb} failed: viewer=${viewer} target=${target} status=${result.status} message=${result.message ?? ""}`,
    );
    return {
      ok: false,
      reason:
        result.message ?? `ListenBrainz returned ${result.status}.`,
    };
  }
  console.log(
    `[follow-action] ${verb} ok: viewer=${viewer} target=${target}${result.noop ? " noop" : ""}`,
  );
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
