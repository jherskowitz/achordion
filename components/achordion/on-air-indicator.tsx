import { Radio } from "lucide-react";
import { auth } from "@/auth";
import { getPlayingNow } from "@/lib/clients/listenbrainz";
import { parachordListenAlong } from "@/lib/parachord";
import { artistHref, recordingHref } from "@/lib/entity-links";
import { cn } from "@/lib/utils";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { ListenAlongLink } from "./listen-along-link";
import { OnAirText } from "./on-air-text";

interface OnAirIndicatorProps {
  username: string;
  /** "compact" — single line, sized to live under a username in lists.
   *  "default" — slightly more breathing room for headers / cards. */
  size?: "compact" | "default";
  className?: string;
}

/**
 * Small inline "now playing" indicator with a Listen-along action.
 * Renders nothing when the user isn't currently scrobbling. Async server
 * component — multiple rows in a list resolve in parallel through
 * React's concurrent renderer.
 *
 * Uses `{ live: true }` so each render goes straight to LB instead of
 * the 30s data cache. Without it, "on air" status lagged by up to 30
 * seconds on list/sidebar surfaces — fine for batch stats, jarring
 * for "is this person playing music right now?" The cost is a
 * parallel LB call per `<OnAirIndicator>` per page render, but
 * /playing-now is fast and isn't governed by the MB queue, so the
 * fan-out is bounded.
 *
 * Important: place this OUTSIDE any wrapping `<Link>` on the row.
 * Anchors inside anchors are invalid HTML, and the listen-along button
 * is itself an `<a>` (parachord:// protocol).
 */
export async function OnAirIndicator({
  username,
  size = "compact",
  className,
}: OnAirIndicatorProps) {
  // Fetch playing-now and the viewer's session in parallel — we need
  // the viewer to know whether to hide the listen-along button (a user
  // listening along to themselves is a loop).
  const [playing, session] = await Promise.all([
    getPlayingNow(username, { live: true }).catch(() => null),
    auth().catch(() => null),
  ]);
  if (!playing) return null;

  const meta = playing.track_metadata;
  const isOwnUser =
    session?.user?.mbUsername?.toLowerCase() === username.toLowerCase();
  const listenAlongHref = parachordListenAlong({
    service: "listenbrainz",
    user: username,
  });
  const recordingMbid =
    meta.mbid_mapping?.recording_mbid ??
    meta.additional_info?.recording_mbid;
  const artistMbid =
    meta.mbid_mapping?.artist_mbids?.[0] ??
    meta.additional_info?.artist_mbids?.[0];
  const trackLink = recordingHref({
    mbid: recordingMbid,
    artist: meta.artist_name,
    title: meta.track_name,
  });
  const artistLink = artistHref({
    mbid: artistMbid,
    name: meta.artist_name,
  });

  const dot = (
    <span
      className="size-1.5 shrink-0 animate-pulse rounded-full bg-emerald-500"
      aria-hidden
    />
  );

  // Shared text node — OnAirText is a client island that handles
  // the marquee-on-overflow behavior. Server-rendered here without
  // any polling; the marquee just adapts to track length on first
  // paint and re-adapts on resize.
  const trackText = (
    <OnAirText
      trackName={meta.track_name}
      trackLink={trackLink}
      artistName={meta.artist_name}
      artistLink={artistLink}
      sizeVariant={size}
    />
  );

  if (size === "default") {
    return (
      <div
        className={cn(
          // `flex max-w-full` instead of `inline-flex` so the
          // container is bounded and the inner OnAirText's clip
          // container actually clips long track / artist names.
          "text-muted-foreground flex max-w-full items-center gap-2 text-xs",
          className,
        )}
      >
        {dot}
        {trackText}
        {!isOwnUser && (
          <IconTooltip
            label={`Listen along with ${username} in Parachord`}
          >
            <ListenAlongLink
              target={username}
              href={listenAlongHref}
              className="bg-primary text-primary-foreground inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[10px] font-medium transition-opacity hover:opacity-90"
            >
              <Radio className="size-2.5" />
              Listen along
            </ListenAlongLink>
          </IconTooltip>
        )}
      </div>
    );
  }

  // Compact — sized to live alongside a username in list rows. Was
  // `inline-flex` before, which sized the container to its content
  // (track+artist+button) and let the indicator overflow the row
  // width on long titles. `flex` makes it block-level so `max-w-full`
  // and the inner OnAirText marquee actually constrain.
  return (
    <div
      className={cn(
        "text-muted-foreground/90 flex max-w-full items-center gap-1.5 text-[11px]",
        className,
      )}
    >
      {dot}
      {trackText}
      {!isOwnUser && (
        <IconTooltip label={`Listen along with ${username} in Parachord`}>
          <ListenAlongLink
            target={username}
            href={listenAlongHref}
            aria-label={`Listen along with ${username} in Parachord`}
            className="bg-primary/90 text-primary-foreground hover:bg-primary inline-flex size-4 shrink-0 items-center justify-center rounded-full transition-colors"
          >
            <Radio className="size-2.5" />
          </ListenAlongLink>
        </IconTooltip>
      )}
    </div>
  );
}
