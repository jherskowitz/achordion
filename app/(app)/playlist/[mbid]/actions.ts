"use server";

import { revalidateTag } from "next/cache";
import { auth } from "@/auth";
import { getLbTokenForRequest } from "@/lib/lb-token";
import {
  getPlaylist,
  setPlaylistVisibility,
} from "@/lib/clients/listenbrainz";

export type VisibilityResult =
  | { ok: true; isPublic: boolean }
  | { ok: false; reason: string };

export async function setPlaylistVisibilityAction(
  mbid: string,
  isPublic: boolean,
): Promise<VisibilityResult> {
  const session = await auth();
  const viewer = session?.user?.mbUsername;
  if (!viewer) return { ok: false, reason: "Sign in to edit playlists." };
  const token = await getLbTokenForRequest();
  if (!token) {
    return {
      ok: false,
      reason: "Add your ListenBrainz token in /settings/connections.",
    };
  }

  // Fetch current playlist to (a) check ownership and (b) carry over
  // the existing collaborators list — LB's edit endpoint rebuilds
  // collaborators from whatever body is sent, so omitting them can
  // wipe them.
  const current = await getPlaylist(mbid).catch(() => null);
  if (!current) return { ok: false, reason: "Playlist not found." };
  if (
    !current.creator ||
    current.creator.toLowerCase() !== viewer.toLowerCase()
  ) {
    return { ok: false, reason: "You can only edit your own playlists." };
  }

  const result = await setPlaylistVisibility(
    mbid,
    isPublic,
    current.collaborators,
    token,
  );
  if (!result.ok) {
    return {
      ok: false,
      reason:
        result.message ?? `ListenBrainz returned ${result.status}.`,
    };
  }

  // Bust caches so the next render reflects the new visibility on
  // both the detail page and the user's playlist index.
  revalidateTag(`lb:playlist:${mbid}`, "max");
  revalidateTag(`lb:user:${viewer}:playlists`, "max");

  return { ok: true, isPublic };
}
