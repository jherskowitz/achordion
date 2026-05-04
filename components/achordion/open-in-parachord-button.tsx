"use client";

import { Play } from "lucide-react";
import {
  parachordImportPlaylist,
  parachordPlayPlaylist,
  parachordPlayRadio,
  type ParachordTrack,
} from "@/lib/parachord";
import { useParachordPresence } from "@/lib/use-parachord-presence";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const PARACHORD_HOMEPAGE = "https://parachord.com";

interface OpenInParachordButtonProps {
  /**
   * "playlist" — handed to Parachord via `parachord://play/playlist?…`
   *   (no library mutation), or `play/playlist?url=` when a URL is given.
   * "radio"    — handed via `parachord://play/radio?…`. Pass `refill`
   *   for a URL that Parachord can poll when the queue runs low.
   * "import"   — uses `parachord://import?…` to permanently add the
   *   playlist to Parachord's library.
   */
  kind: "playlist" | "radio" | "import";
  tracks: ParachordTrack[];
  /** Optional public URL — preferred input shape when available. */
  url?: string;
  /** Refill endpoint for `kind="radio"`. */
  refill?: string;
  /** Display label for radio stations / fallback playlist title. */
  title?: string;
  creator?: string;
  label?: string;
  className?: string;
}

/**
 * Hands a tracklist (album, station, playlist) off to Parachord using
 * the PR #755 protocol surface — a single `parachord://play/...` URL is
 * enough; Parachord wakes (if not running) and plays the tracklist
 * without mutating the user's library. Falls back to `parachord://import`
 * only when the caller explicitly opts into the library-import flavour.
 *
 * Mirrors `ParachordCtaButton`'s two visual states via
 * `useParachordPresence`: brand purple with pulsing green dot when
 * Parachord is running, muted disabled with a "Get Parachord" tooltip
 * when it isn't.
 */
export function OpenInParachordButton({
  kind,
  tracks,
  url,
  refill,
  title,
  creator,
  label = "Play in Parachord",
  className,
}: OpenInParachordButtonProps) {
  const running = useParachordPresence();
  if (tracks.length === 0 && !url) return null;

  let href: string;
  if (kind === "import") {
    href = parachordImportPlaylist({
      title: title ?? "Achordion playlist",
      creator,
      tracks,
    });
  } else if (kind === "radio") {
    href = parachordPlayRadio({
      ...(url ? { url } : { tracks }),
      ...(refill ? { refill } : {}),
      ...(title ? { displayName: title } : {}),
    });
  } else {
    href = parachordPlayPlaylist(url ? { url } : { tracks });
  }

  if (running) {
    return (
      <a
        href={href}
        className={cn(
          "inline-flex h-7 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-medium text-white transition-[filter] hover:brightness-110",
          className,
        )}
        style={{ backgroundColor: "var(--parachord-accent)" }}
      >
        <span
          aria-hidden
          className="size-1.5 animate-pulse rounded-full bg-emerald-400"
        />
        {label}
      </a>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="button"
          aria-disabled="true"
          tabIndex={0}
          className={cn(
            "bg-muted text-muted-foreground inline-flex h-7 shrink-0 cursor-not-allowed items-center gap-2 rounded-lg px-3 text-xs font-medium opacity-70",
            className,
          )}
        >
          <Play className="size-3 fill-current" />
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[220px] text-center">
        <p>Parachord isn&apos;t running.</p>
        <a
          href={PARACHORD_HOMEPAGE}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:opacity-80"
        >
          Get Parachord →
        </a>
      </TooltipContent>
    </Tooltip>
  );
}
