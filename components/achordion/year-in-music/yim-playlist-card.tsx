import Link from "next/link";
import { Sparkles } from "lucide-react";
import {
  playlistMbidFromIdentifier,
  type YimPlaylist,
} from "@/lib/clients/listenbrainz";

function asString(v: string | string[] | undefined): string | undefined {
  if (!v) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

export function YimPlaylistCard({
  playlist,
  badge,
}: {
  playlist: YimPlaylist | null | undefined;
  badge?: string;
}) {
  if (!playlist) {
    return (
      <div className="border-border/60 rounded-xl border px-4 py-3">
        <p className="text-muted-foreground text-sm">
          No playlist generated.
        </p>
      </div>
    );
  }
  const ident = asString(playlist.identifier);
  const mbid = ident ? playlistMbidFromIdentifier(ident) : null;
  const annotation = stripHtml(playlist.annotation);

  const inner = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-foreground truncate text-base font-medium">
          {playlist.title ?? "Untitled playlist"}
        </h3>
        {badge && (
          <span className="bg-foreground/10 text-foreground/80 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] tracking-wide uppercase">
            <Sparkles className="size-2.5" />
            {badge}
          </span>
        )}
      </div>
      {playlist.creator && (
        <p className="text-muted-foreground mt-1 text-xs">
          by {playlist.creator}
        </p>
      )}
      {annotation && (
        <p className="text-muted-foreground/80 mt-2 line-clamp-3 text-xs leading-5">
          {annotation}
        </p>
      )}
    </>
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
