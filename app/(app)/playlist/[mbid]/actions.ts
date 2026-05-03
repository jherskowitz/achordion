"use server";

import { revalidateTag } from "next/cache";
import { auth } from "@/auth";
import { getLbTokenForRequest } from "@/lib/lb-token";
import {
  editPlaylist,
  getPlaylist,
  type PlaylistEditFields,
} from "@/lib/clients/listenbrainz";

export type EditResult =
  | { ok: true }
  | { ok: false; reason: string };

async function loadOwnedPlaylist(
  mbid: string,
): Promise<
  | { ok: true; viewer: string; token: string; collaborators: string[] }
  | { ok: false; reason: string }
> {
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
  // Try authed first — the playlist might be private, in which case
  // the unauthed endpoint 404s. Authed lookup also bypasses the data
  // cache, so we get the freshest collaborators list to forward.
  const current =
    (await getPlaylist(mbid, token).catch(() => null)) ??
    (await getPlaylist(mbid).catch(() => null));
  if (!current) return { ok: false, reason: "Playlist not found." };
  if (
    !current.creator ||
    current.creator.toLowerCase() !== viewer.toLowerCase()
  ) {
    return { ok: false, reason: "You can only edit your own playlists." };
  }
  return {
    ok: true,
    viewer,
    token,
    collaborators: current.collaborators,
  };
}

function bustCache(mbid: string, viewer: string) {
  revalidateTag(`lb:playlist:${mbid}`, "max");
  revalidateTag(`lb:user:${viewer}:playlists`, "max");
}

export type VisibilityResult =
  | { ok: true; isPublic: boolean }
  | { ok: false; reason: string };

export async function setPlaylistVisibilityAction(
  mbid: string,
  isPublic: boolean,
): Promise<VisibilityResult> {
  const ctx = await loadOwnedPlaylist(mbid);
  if (!ctx.ok) return ctx;
  const result = await editPlaylist(
    mbid,
    { isPublic, collaborators: ctx.collaborators },
    ctx.token,
  );
  if (!result.ok) {
    return {
      ok: false,
      reason:
        result.message ?? `ListenBrainz returned ${result.status}.`,
    };
  }
  bustCache(mbid, ctx.viewer);
  return { ok: true, isPublic };
}

export interface EditPlaylistInput {
  title: string;
  annotation: string;
  isPublic: boolean;
  collaborators: string[];
}

/**
 * Full-edit action backing the Edit Playlist modal. Always sends all
 * four fields LB lets us touch — `setPlaylistVisibilityAction` is
 * the narrower toggle for the inline pill.
 */
export async function editPlaylistAction(
  mbid: string,
  input: EditPlaylistInput,
): Promise<EditResult> {
  const ctx = await loadOwnedPlaylist(mbid);
  if (!ctx.ok) return ctx;

  const title = input.title.trim();
  if (title.length === 0) {
    return { ok: false, reason: "Title is required." };
  }
  const collaborators = input.collaborators
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  // Don't include the owner as a collaborator — LB rejects that.
  const cleaned = collaborators.filter(
    (c) => c.toLowerCase() !== ctx.viewer.toLowerCase(),
  );

  const fields: PlaylistEditFields = {
    title,
    annotation: input.annotation,
    isPublic: input.isPublic,
    collaborators: cleaned,
  };
  const result = await editPlaylist(mbid, fields, ctx.token);
  if (!result.ok) {
    return {
      ok: false,
      reason:
        result.message ?? `ListenBrainz returned ${result.status}.`,
    };
  }
  bustCache(mbid, ctx.viewer);
  return { ok: true };
}
