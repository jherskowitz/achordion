import { Plus } from "lucide-react";
import { IconTooltip } from "@/components/ui/icon-tooltip";

/**
 * "+" tile rendered at the end of every streaming-service icon row.
 * Drops the user on the relevant MusicBrainz `/edit` page in a new
 * tab so they can wire up additional URLs (Spotify / Apple Music /
 * Bandcamp / etc.) directly at the source.
 *
 * `mbEntity` is the entity type segment as MB names it: `artist`,
 * `release-group`, `recording` (also `release` for specific editions
 * if we ever surface a streaming row at that level).
 */
export function AddSourcesButton({
  mbEntity,
  mbid,
}: {
  mbEntity: "artist" | "release-group" | "recording" | "release";
  mbid: string;
}) {
  const href = `https://musicbrainz.org/${mbEntity}/${mbid}/edit`;
  return (
    <IconTooltip label="Add sources">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Add sources on MusicBrainz"
        suppressHydrationWarning
        className="border-border/60 text-muted-foreground hover:border-foreground/40 hover:bg-muted/40 hover:text-foreground inline-flex size-9 items-center justify-center rounded-md border border-dashed transition-colors"
      >
        <Plus className="size-4" />
      </a>
    </IconTooltip>
  );
}
