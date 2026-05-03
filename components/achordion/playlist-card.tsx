import Link from "next/link";
import { Globe, Lock, Sparkles, Users } from "lucide-react";
import {
  playlistMbidFromIdentifier,
  type LbPlaylistSummary,
  type LbRadioTrack,
} from "@/lib/clients/listenbrainz";
import { stripHtml } from "@/lib/strip-html";
import { PlaylistCoverMosaic } from "./playlist-cover-mosaic";

const JSPF_PLAYLIST_KEY = "https://musicbrainz.org/doc/jspf#playlist";

function formatDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function algorithmBadge(source: string): string {
  // Make the LB internal patch IDs a bit nicer for display.
  return source
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function PlaylistCard({
  entry,
  /** Hide the creator byline when we already know whose page we're on. */
  hideCreatorIfMatches,
  /** Tracks for the cover mosaic. When omitted, no mosaic renders. */
  tracks,
}: {
  entry: LbPlaylistSummary;
  hideCreatorIfMatches?: string;
  tracks?: LbRadioTrack[];
}) {
  const p = entry.playlist;
  const ext = p.extension?.[JSPF_PLAYLIST_KEY];
  const mbid = playlistMbidFromIdentifier(p.identifier);
  const algoSource = ext?.additional_metadata?.algorithm_metadata?.source_patch;
  const isCollab = (ext?.collaborators?.length ?? 0) > 0;
  const creator = p.creator ?? ext?.creator;
  const showCreator =
    creator &&
    creator.toLowerCase() !== (hideCreatorIfMatches ?? "").toLowerCase();
  const dateStr =
    formatDate(ext?.last_modified_at) ?? formatDate(p.date) ?? null;
  const showMosaic = tracks !== undefined;

  const body = (
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-foreground truncate text-base font-medium">
          {p.title}
        </h3>
        {ext?.public === false ? (
          <span
            className="text-muted-foreground/70 inline-flex shrink-0 items-center gap-1 text-[10px] tracking-wide uppercase"
            title="Private playlist"
          >
            <Lock className="size-3" />
            private
          </span>
        ) : (
          <span
            className="text-muted-foreground/60 inline-flex shrink-0 items-center gap-1 text-[10px] tracking-wide uppercase"
            title="Public playlist"
          >
            <Globe className="size-3" />
            public
          </span>
        )}
      </div>
      {(showCreator || dateStr || algoSource || isCollab) && (
        <p className="text-muted-foreground mt-1 inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
          {algoSource && (
            <span className="bg-foreground/10 text-foreground/80 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] tracking-wide uppercase">
              <Sparkles className="size-2.5" />
              {algorithmBadge(algoSource)}
            </span>
          )}
          {showCreator && <span>by {creator}</span>}
          {isCollab && (
            <span
              className="text-muted-foreground/80 inline-flex items-center gap-1"
              title="Collaborative playlist"
            >
              <Users className="size-3" />
              {ext?.collaborators?.length ?? 0}
            </span>
          )}
          {dateStr && (
            <span className="text-muted-foreground/70">· {dateStr}</span>
          )}
        </p>
      )}
      {p.annotation && stripHtml(p.annotation) && (
        <p className="text-muted-foreground/80 mt-2 line-clamp-2 text-xs leading-5">
          {stripHtml(p.annotation)}
        </p>
      )}
    </div>
  );

  const inner = showMosaic ? (
    <div className="flex gap-3">
      <PlaylistCoverMosaic tracks={tracks} size={64} alt={p.title} />
      {body}
    </div>
  ) : (
    body
  );

  const cardClass =
    "border-border/60 hover:border-foreground/30 hover:bg-muted/30 block rounded-xl border px-4 py-3 transition-colors";
  const cardClassStatic = "border-border/60 rounded-xl border px-4 py-3";

  return mbid ? (
    <Link href={`/playlist/${mbid}`} className={cardClass}>
      {inner}
    </Link>
  ) : (
    <div className={cardClassStatic}>{inner}</div>
  );
}
