import Link from "next/link";
import { LazyAlbumCover } from "./lazy-album-cover";
import { PlayOnHoverFab } from "./play-on-hover-fab";
import { parachordPlayAlbum } from "@/lib/parachord";
import { artistHref, releaseGroupHref } from "@/lib/entity-links";
import type { CriticsPickAlbum } from "@/lib/clients/critical-darlings";

/**
 * Critical Darlings album tile.
 *
 * Used to be `async` and resolved its cover-art URL server-side via
 * MusicBrainz `searchReleaseGroups`. With ~30 cards on the page that
 * meant ~30 calls serialized through MB's 1-req/sec rate limiter on
 * cold render — first paint took half a minute.
 *
 * Cover lookup is now lazy and client-side via `<LazyAlbumCover>`,
 * which fans out parallel `/api/track-cover` calls (the same artist+
 * title resolver the radio rewinds + NACC charts use). The card
 * itself renders instantly with a placeholder cover; covers stream
 * in over a few seconds while the user can already scroll, click,
 * read synopses.
 *
 * Navigation falls back to the lookup route
 * (`/release-group/lookup?artist=…&title=…`) when no MBID is in
 * hand — same canonicalization the rest of the app uses for text-
 * only entity references.
 */
export function CriticalDarlingCard({
  album,
}: {
  album: CriticsPickAlbum;
}) {
  // No MBID at this point — `releaseGroupHref` builds a /lookup URL
  // that resolves canonically on the destination server. Same
  // resolver the artist credit-link / chart-row clicks already use.
  const albumLink = releaseGroupHref({
    artist: album.artist,
    title: album.title,
  });
  // Parachord resolves artist+title against its own sources, so
  // shipping just the text is fine.
  const parachordHref = parachordPlayAlbum({
    artist: album.artist,
    title: album.title,
  });

  return (
    <article className="min-w-0 space-y-2">
      {/* Cover container is `group relative` so the play fab fades
          in on hover — same treatment used on chart / discography /
          fresh-releases grids. */}
      <div className="group relative overflow-hidden rounded-md">
        <Link href={albumLink} prefetch={false} className="block">
          <LazyAlbumCover
            artist={album.artist}
            album={album.title}
            alt={album.title}
          />
        </Link>
        <PlayOnHoverFab
          href={parachordHref}
          label={`Play "${album.title}" by ${album.artist} in Parachord`}
        />
      </div>
      <div>
        <p className="truncate text-sm font-medium">
          <Link href={albumLink} prefetch={false} className="hover:underline">
            {album.title}
          </Link>
        </p>
        <p className="text-muted-foreground truncate text-xs">
          <Link
            href={artistHref({ name: album.artist })}
            prefetch={false}
            className="hover:text-foreground hover:underline"
          >
            {album.artist}
          </Link>
        </p>
      </div>
      {album.description && (
        // Synopses are written to fit in a tweet (~280 chars), so always
        // render the whole thing — no line-clamp.
        <p className="text-muted-foreground/80 text-xs leading-5">
          {album.description}
        </p>
      )}
    </article>
  );
}

export function CriticalDarlingCardSkeleton() {
  return (
    <article className="min-w-0 space-y-2">
      <div className="bg-muted aspect-square w-full animate-pulse rounded-md" />
      <div className="space-y-1.5">
        <div className="bg-muted h-4 w-2/3 animate-pulse rounded" />
        <div className="bg-muted h-3 w-1/2 animate-pulse rounded" />
      </div>
      {/* Reserve roughly tweet-sized text height so the grid doesn't
          jump when synopses fill in. */}
      <div className="space-y-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={`bg-muted h-3 animate-pulse rounded ${
              i === 4 ? "w-2/3" : "w-full"
            }`}
          />
        ))}
      </div>
    </article>
  );
}
