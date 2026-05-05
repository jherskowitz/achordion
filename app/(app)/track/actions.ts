"use server";

import { revalidateTag } from "next/cache";
import { auth } from "@/auth";
import { getLbTokenForRequest } from "@/lib/lb-token";
import {
  submitFeedback,
  submitPin,
  submitRecommendation,
  addRecordingToPlaylist,
  createPlaylistOnLb,
  deleteListen,
} from "@/lib/clients/listenbrainz";

export type ActionResult = { ok: true } | { ok: false; reason: string };

async function requireUserToken(): Promise<
  | { ok: true; viewer: string; token: string }
  | { ok: false; reason: string }
> {
  const session = await auth();
  const viewer = session?.user?.mbUsername;
  if (!viewer) return { ok: false, reason: "Sign in to do that." };
  const token = await getLbTokenForRequest();
  if (!token) {
    return {
      ok: false,
      reason: "Add your ListenBrainz token in /settings/connections.",
    };
  }
  return { ok: true, viewer, token };
}

export async function feedbackTrackAction(input: {
  recordingMbid: string;
  score: 0 | 1 | -1;
}): Promise<ActionResult> {
  const auth = await requireUserToken();
  if (!auth.ok) return auth;
  try {
    await submitFeedback(auth.token, input.recordingMbid, input.score);
    revalidateTag(`lb:user:${auth.viewer}:loved`, "max");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "Couldn't update feedback.",
    };
  }
}

export async function pinTrackAction(input: {
  recordingMbid?: string;
  recordingMsid?: string;
  blurb?: string;
  pinnedUntil?: number;
}): Promise<ActionResult> {
  const auth = await requireUserToken();
  if (!auth.ok) return auth;
  if (!input.recordingMbid && !input.recordingMsid) {
    return {
      ok: false,
      reason: "Track is missing a MusicBrainz ID — can't pin.",
    };
  }
  try {
    await submitPin(auth.token, {
      recordingMbid: input.recordingMbid,
      recordingMsid: input.recordingMsid,
      blurb: input.blurb,
      pinnedUntil: input.pinnedUntil,
    });
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "Couldn't pin track.",
    };
  }
}

export async function recommendTrackAction(input: {
  recordingMbid: string;
  recipients: string[];
  blurb?: string;
}): Promise<ActionResult> {
  const auth = await requireUserToken();
  if (!auth.ok) return auth;
  if (input.recipients.length === 0) {
    return { ok: false, reason: "Pick at least one recipient." };
  }
  if (input.recipients.length > 50) {
    return { ok: false, reason: "Pick 50 or fewer recipients." };
  }
  try {
    await submitRecommendation(auth.token, {
      recordingMbid: input.recordingMbid,
      recipients: input.recipients,
      blurb: input.blurb,
    });
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      reason:
        e instanceof Error ? e.message : "Couldn't send recommendations.",
    };
  }
}

export async function addToPlaylistAction(input: {
  playlistMbid: string;
  recordingMbid: string;
}): Promise<ActionResult> {
  const auth = await requireUserToken();
  if (!auth.ok) return auth;
  try {
    await addRecordingToPlaylist(
      auth.token,
      input.playlistMbid,
      input.recordingMbid,
    );
    revalidateTag(`lb:playlist:${input.playlistMbid}`, "max");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "Couldn't add to playlist.",
    };
  }
}

export type CreatePlaylistResult =
  | { ok: true; playlistMbid: string }
  | { ok: false; reason: string };

export async function createPlaylistAction(input: {
  name: string;
  isPublic: boolean;
  recordingMbid?: string;
}): Promise<CreatePlaylistResult> {
  const auth = await requireUserToken();
  if (!auth.ok) return auth;
  if (!input.name.trim()) {
    return { ok: false, reason: "Playlist name is required." };
  }
  try {
    const { playlistMbid } = await createPlaylistOnLb(auth.token, {
      name: input.name.trim(),
      isPublic: input.isPublic,
      recordingMbid: input.recordingMbid,
    });
    revalidateTag(`lb:user:${auth.viewer}:playlists`, "max");
    return { ok: true, playlistMbid };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "Couldn't create playlist.",
    };
  }
}
