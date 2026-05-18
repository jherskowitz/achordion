"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { auth } from "@/auth";
import { getLbTokenForRequest } from "@/lib/lb-token";
import {
  deletePlaylist,
  editPlaylist,
  getPlaylist,
  type PlaylistEditFields,
} from "@/lib/clients/listenbrainz";
import { isFeatureEnabled } from "@/lib/flags";
import { indexPlaylistPublished } from "@/lib/playlist-published-index";

export type EditResult =
  | { ok: true }
  | { ok: false; reason: string };

async function loadOwnedPlaylist(
  mbid: string,
): Promise<
  | {
      ok: true;
      viewer: string;
      token: string;
      collaborators: string[];
      /** Pre-edit visibility, captured so callers can detect the
       *  false → true transition for the playlist_published event. */
      currentIsPublic: boolean;
      /** Pre-edit title, used as the playlist_published headline
       *  when the title doesn't change in this edit. */
      currentTitle: string;
    }
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
    currentIsPublic: current.isPublic,
    currentTitle: current.title,
  };
}

/**
 * Fire a `playlist_published` synthetic feed event when a playlist
 * transitions from private → public. Gated behind the
 * `playlist-published-events` flag; fails-soft so a flag-off or
 * Upstash outage never breaks the edit/visibility action itself.
 *
 * Same fan-out pattern as `loved_recording`, `mention`, and
 * `listen_along` — `lib/playlist-events.ts` is the reader.
 */
async function maybeRecordPublishedEvent(opts: {
  mbid: string;
  owner: string;
  title: string;
  wasPublic: boolean;
  isPublic: boolean;
}): Promise<void> {
  // Only the false → true edge fires. No-op edits, already-public
  // edits, or true → false transitions never produce an event.
  if (opts.wasPublic) return;
  if (!opts.isPublic) return;
  try {
    if (!(await isFeatureEnabled("playlist-published-events", opts.owner))) {
      return;
    }
    await indexPlaylistPublished({
      mbid: opts.mbid,
      owner: opts.owner,
      title: opts.title,
    });
  } catch {
    // Synthetic-event fan-out failure shouldn't break the
    // user-visible edit. Swallow + move on.
  }
}

function bustCache(mbid: string, viewer: string) {
  revalidateTag(`lb:playlist:${mbid}`, "max");
  revalidateTag(`lb:user:${viewer}:playlists`, "max");
  // revalidateTag only busts the in-process Next.js data-fetch cache.
  // Two additional caches sit on top of that and need explicit busts:
  //
  //   1. The RSC payload cache that Next.js keeps client-side per
  //      route. Without a path-level revalidation, navigating back to
  //      the owner's playlists tab after a visibility flip serves a
  //      stale render — chip still labelled PRIVATE / PUBLIC, even
  //      though the data layer has fresh state.
  //
  //   2. Vercel's edge CDN cache on the `/api/user/<name>/playlists`
  //      route, which carries `s-maxage=60` for anonymous viewers.
  //      `revalidateTag` doesn't propagate to the CDN entry, so
  //      anonymous "Load more" clients can see up to 60s of stale
  //      data post-edit. Same pattern for the playlist's preview
  //      endpoint (`s-maxage=3600` in the public-playlist path) —
  //      busting it here keeps mosaic previews honest after edits.
  //
  // Calling revalidatePath on each affected path makes Next.js mark
  // both the RSC payload and the CDN entry stale.
  revalidatePath(`/user/${viewer}/playlists`);
  revalidatePath(`/user/${viewer}`);
  revalidatePath(`/api/user/${viewer}/playlists`);
  revalidatePath(`/api/playlist/${mbid}/preview`);
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
  await maybeRecordPublishedEvent({
    mbid,
    owner: ctx.viewer,
    title: ctx.currentTitle,
    wasPublic: ctx.currentIsPublic,
    isPublic,
  });
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
  await maybeRecordPublishedEvent({
    mbid,
    owner: ctx.viewer,
    // Title may have changed in this edit — use the incoming title
    // so the feed event reflects what the playlist is called *after*
    // the publish, not its private working title.
    title: fields.title ?? ctx.currentTitle,
    wasPublic: ctx.currentIsPublic,
    isPublic: input.isPublic,
  });
  return { ok: true };
}

export type DeleteResult =
  | { ok: true; redirectTo: string }
  | { ok: false; reason: string };

/**
 * Permanently delete a playlist on LB. Owner-only — same gate as
 * `editPlaylistAction`. On success returns the URL to redirect to
 * (the owner's profile playlists tab); the client navigates there
 * after the action settles so the user lands somewhere sensible
 * rather than on a now-404 page.
 *
 * Cache bust mirrors the edit path: the playlist's own slot + the
 * owner's playlists-list slot so the deleted playlist disappears
 * from any list view that was already rendered.
 */
export async function deletePlaylistAction(
  mbid: string,
): Promise<DeleteResult> {
  const ctx = await loadOwnedPlaylist(mbid);
  if (!ctx.ok) return ctx;
  const result = await deletePlaylist(mbid, ctx.token);
  if (!result.ok) {
    return {
      ok: false,
      reason:
        result.message ?? `ListenBrainz returned ${result.status}.`,
    };
  }
  bustCache(mbid, ctx.viewer);
  return {
    ok: true,
    redirectTo: `/user/${encodeURIComponent(ctx.viewer)}/playlists`,
  };
}
