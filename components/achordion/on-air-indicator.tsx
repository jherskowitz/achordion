import { Radio } from "lucide-react";
import { getPlayingNow } from "@/lib/clients/listenbrainz";
import { parachordListenAlong } from "@/lib/parachord";
import { cn } from "@/lib/utils";

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
 * React's concurrent renderer, and `getPlayingNow` revalidates at 30s
 * so repeat views inside a window are served from the data cache.
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
  let playing;
  try {
    playing = await getPlayingNow(username);
  } catch {
    return null;
  }
  if (!playing) return null;

  const meta = playing.track_metadata;
  const listenAlongHref = parachordListenAlong({
    service: "listenbrainz",
    user: username,
  });

  const dot = (
    <span
      className="size-1.5 shrink-0 animate-pulse rounded-full bg-emerald-500"
      aria-hidden
    />
  );

  if (size === "default") {
    return (
      <div
        className={cn(
          "text-muted-foreground inline-flex items-center gap-2 text-xs",
          className,
        )}
      >
        {dot}
        <span className="min-w-0 truncate">
          <span className="text-foreground font-medium">{meta.track_name}</span>
          <span className="text-muted-foreground"> — {meta.artist_name}</span>
        </span>
        <a
          href={listenAlongHref}
          title={`Listen along with ${username} in Parachord`}
          className="bg-primary text-primary-foreground inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[10px] font-medium transition-opacity hover:opacity-90"
        >
          <Radio className="size-2.5" />
          Listen along
        </a>
      </div>
    );
  }

  // Compact — sized to live alongside a username in list rows.
  return (
    <div
      className={cn(
        "text-muted-foreground/90 inline-flex max-w-full items-center gap-1.5 text-[11px]",
        className,
      )}
    >
      {dot}
      <span className="min-w-0 truncate">
        <span className="text-foreground/90">{meta.track_name}</span>
        <span className="text-muted-foreground"> — {meta.artist_name}</span>
      </span>
      <a
        href={listenAlongHref}
        title={`Listen along with ${username} in Parachord`}
        aria-label={`Listen along with ${username} in Parachord`}
        className="bg-primary/90 text-primary-foreground hover:bg-primary inline-flex size-4 shrink-0 items-center justify-center rounded-full transition-colors"
      >
        <Radio className="size-2.5" />
      </a>
    </div>
  );
}
