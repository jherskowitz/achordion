"use server";

import { revalidatePath } from "next/cache";
import {
  clearLbTokenCookie,
  setLbTokenCookie,
  validateLbToken,
} from "@/lib/lb-token";
import { signOut, auth } from "@/auth";
import {
  getProfile as getBskyProfile,
  normalizeHandle,
  resolveHandle,
} from "@/lib/clients/bluesky";
import {
  deleteBskyLink,
  getBskyLink,
  setBskyLink,
} from "@/lib/bsky-link";
import { isFeatureEnabled } from "@/lib/flags";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://achordion.xyz";

export type LinkBskyState =
  | { status: "idle" }
  | { status: "success"; handle: string }
  | { status: "error"; message: string; expectedUrl?: string };

/**
 * Verify two-way handshake and persist a Bluesky <-> MusicBrainz
 * binding. Both sides must claim each other:
 *   1. Achordion side: the signed-in viewer pasted this handle
 *      (implicit by being signed in + submitting the form).
 *   2. Bluesky side: the bio at <handle> must contain the viewer's
 *      Achordion profile URL — proves the handle's owner is the
 *      same person.
 *
 * Without (2) any LB user could "claim" any Bluesky handle.
 */
export async function linkBlueskyAction(
  _prev: LinkBskyState,
  formData: FormData,
): Promise<LinkBskyState> {
  const session = await auth();
  const lbUsername = session?.user?.mbUsername;
  if (!lbUsername) {
    return { status: "error", message: "Sign in first." };
  }
  if (!(await isFeatureEnabled("bsky-link", lbUsername))) {
    return { status: "error", message: "Feature unavailable." };
  }

  const raw = String(formData.get("handle") ?? "");
  const handle = normalizeHandle(raw);
  if (!handle || !handle.includes(".")) {
    return {
      status: "error",
      message: "Enter a Bluesky handle like jherskowitz.bsky.social.",
    };
  }

  let did: string;
  try {
    did = await resolveHandle(handle);
  } catch {
    return {
      status: "error",
      message: `Couldn't find @${handle} on Bluesky.`,
    };
  }

  const profile = await getBskyProfile(did);
  if (!profile) {
    return {
      status: "error",
      message: "Bluesky is unreachable right now. Try again in a moment.",
    };
  }

  const expectedUrl = `${SITE_URL}/user/${lbUsername}`;
  const bio = profile.description ?? "";
  if (!bio.includes(expectedUrl)) {
    return {
      status: "error",
      message:
        "We couldn't find your Achordion profile link in your Bluesky bio.",
      expectedUrl,
    };
  }

  await setBskyLink(lbUsername, {
    handle: profile.handle,
    did: profile.did,
    verified_at: Date.now(),
  });

  revalidatePath("/settings");
  revalidatePath(`/user/${lbUsername}`);
  return { status: "success", handle: profile.handle };
}

export async function unlinkBlueskyAction(): Promise<void> {
  const session = await auth();
  const lbUsername = session?.user?.mbUsername;
  if (!lbUsername) return;
  if (!(await isFeatureEnabled("bsky-link", lbUsername))) return;
  const existing = await getBskyLink(lbUsername);
  if (!existing) return;
  await deleteBskyLink(lbUsername);
  revalidatePath("/settings");
  revalidatePath(`/user/${lbUsername}`);
}

export type SaveLbTokenState =
  | { status: "idle" }
  | { status: "success"; userName: string }
  | { status: "error"; message: string };

export async function saveLbTokenAction(
  _prev: SaveLbTokenState,
  formData: FormData,
): Promise<SaveLbTokenState> {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) {
    return { status: "error", message: "Paste a token first." };
  }
  const result = await validateLbToken(token);
  if (!result.valid) {
    return { status: "error", message: result.reason };
  }
  await setLbTokenCookie(token);
  revalidatePath("/settings/connections");
  revalidatePath("/settings");
  return { status: "success", userName: result.userName };
}

export async function clearLbTokenAction(): Promise<void> {
  await clearLbTokenCookie();
  revalidatePath("/settings/connections");
  revalidatePath("/settings");
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
