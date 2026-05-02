import { caaReleaseUrl } from "@/lib/clients/coverart";
import type { LbRadioTrack } from "@/lib/clients/listenbrainz";
import { CoverArt } from "./cover-art";
import { cn } from "@/lib/utils";

function uniqueCovers(tracks: LbRadioTrack[], max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of tracks.slice(0, 16)) {
    let url: string | null = null;
    if (t.caaReleaseMbid && t.caaId) {
      url = `https://archive.org/download/mbid-${t.caaReleaseMbid}/mbid-${t.caaReleaseMbid}-${t.caaId}_thumb500.jpg`;
    } else if (t.releaseMbid) {
      url = caaReleaseUrl(t.releaseMbid, 500);
    }
    if (url && !seen.has(url)) {
      seen.add(url);
      out.push(url);
      if (out.length === max) break;
    }
  }
  return out;
}

interface PlaylistCoverMosaicProps {
  tracks: LbRadioTrack[];
  /** Used as both the rendered display size (px square) and as the
   *  next/image hint. Shape is always square. */
  size?: number;
  className?: string;
  alt?: string;
}

/**
 * 2×2 mosaic of unique album covers from the playlist's tracks. Falls
 * back to a single cover or the disc-icon placeholder when there are
 * fewer than 4 distinct cover sources.
 */
export function PlaylistCoverMosaic({
  tracks,
  size = 64,
  className,
  alt = "Playlist cover",
}: PlaylistCoverMosaicProps) {
  const covers = uniqueCovers(tracks, 4);
  const sizeStyle = { width: size, height: size };

  if (covers.length === 0) {
    return (
      <CoverArt
        src={null}
        alt={alt}
        size={size}
        rounded="md"
        className={className}
      />
    );
  }

  if (covers.length < 4) {
    return (
      <CoverArt
        src={covers[0]}
        alt={alt}
        size={size}
        rounded="md"
        className={className}
      />
    );
  }

  return (
    <div
      className={cn(
        "grid shrink-0 grid-cols-2 gap-0.5 overflow-hidden rounded-md",
        className,
      )}
      style={sizeStyle}
      role="img"
      aria-label={alt}
    >
      {covers.map((url) => (
        <CoverArt
          key={url}
          src={url}
          alt=""
          size={Math.round(size / 2)}
          rounded="none"
          className="size-full"
        />
      ))}
    </div>
  );
}
