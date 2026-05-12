import "server-only";

import type { PinnedRecording } from "@/lib/clients/listenbrainz";
import { extractMentions } from "@/lib/mentions";
import { indexPinMentions } from "@/lib/mention-index";

/**
 * Passive-backfill helper: walk a list of pins, parse each
 * blurb for `@username` mentions, and fan-out into the
 * mention-index so the mentioned users see the pin in their
 * /feed.
 *
 * Fire-and-forget shape — call sites pass `void` so the
 * triggering render doesn't wait on the Upstash writes. Empty
 * blurbs / no mentions / Upstash misconfigured: silent no-op.
 *
 * Centralised here so /user/<name>, /user/<name>/pins, and any
 * future pin-rendering surface can share one call point. The
 * function is responsible for shape-translating each pin into
 * the indexer's contract (rowId / fromUser / blurb / etc.).
 */
export async function indexPinMentionsFromList(
  pins: ReadonlyArray<PinnedRecording>,
  fromUser: string,
): Promise<void> {
  if (pins.length === 0) return;
  await Promise.all(
    pins.map(async (pin) => {
      const blurb = (pin.blurb_content ?? "").trim();
      if (!blurb) return;
      const mentioned = extractMentions(blurb);
      if (mentioned.length === 0) return;
      const meta = pin.track_metadata;
      const recordingMbid =
        pin.recording_mbid ??
        meta?.mbid_mapping?.recording_mbid ??
        null;
      await indexPinMentions(
        {
          rowId: pin.row_id,
          created: pin.created,
          fromUser,
          recordingMbid,
          trackName: meta?.track_name ?? null,
          artistName: meta?.artist_name ?? null,
          blurb,
        },
        mentioned,
      );
    }),
  );
}
