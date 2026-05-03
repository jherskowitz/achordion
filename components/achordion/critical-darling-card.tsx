import Link from "next/link";
import { CoverArt } from "./cover-art";
import { PlayOnHoverFab } from "./play-on-hover-fab";
import { searchReleaseGroups } from "@/lib/clients/musicbrainz";
import { caaReleaseGroupUrl } from "@/lib/clients/coverart";
import { parachordPlayAlbum } from "@/lib/parachord";
import { artistHref, releaseGroupHref } from "@/lib/entity-links";
import type { CriticsPickAlbum } from "@/lib/clients/critical-darlings";

/**
 * Resolve a release-group MBID + cover-art URL for a Critical Darlings
 * pick by searching MusicBrainz. The MB client serializes requests at
 * 1/sec — wrap each card in its own Suspense boundary so this work
 * streams in rather than blocking the whole page.
 */
async function resolveCover(album: CriticsPickAlbum): Promise<{
  mbid: string | null;
  coverUrl: string | null;
}> {
  try {
    // Pull a handful of candidates and prefer Album over Single/EP/etc.
    // Critical Darlings entries are reviews of full albums, but plain
    // `release:"…" AND artist:"…"` often returns a same-titled single
    // ahead of the album when both exist (e.g. lead-single sharing the
    // album name). Bias the result by primary-type, falling back to
    // MB's own score order when no Album candidate exists.
    const query = `release:"${album.title.replace(/"/g, '\\"')}" AND artist:"${album.artist.replace(/"/g, '\\"')}"`;
    const results = await searchReleaseGroups(query, 8);
    if (results.length === 0) return { mbid: null, coverUrl: null };
    const album_ = results.find((r) => r["primary-type"] === "Album");
    const ep = results.find((r) => r["primary-type"] === "EP");
    const top = album_ ?? ep ?? results[0];
    return { mbid: top.id, coverUrl: caaReleaseGroupUrl(top.id, 250) };
  } catch {
    return { mbid: null, coverUrl: null };
  }
}

export async function CriticalDarlingCard({
  album,
}: {
  album: CriticsPickAlbum;
}) {
  const { mbid, coverUrl } = await resolveCover(album);
  // Use the lookup route as a fallback so the title+cover are always
  // navigable even if MB search came back empty during render.
  const albumLink = releaseGroupHref({
    mbid,
    artist: album.artist,
    title: album.title,
  });
  // Prefer the resolved MBID — Parachord picks the best resolver.
  // Fall back to artist+title when MB search didn't find a match.
  const parachordHref = parachordPlayAlbum(
    mbid ? { mbid } : { artist: album.artist, title: album.title },
  );

  return (
    <article className="min-w-0 space-y-2">
      {/* Cover container is `group relative` so the play fab fades
          in on hover — same treatment used on chart / discography /
          fresh-releases grids. */}
      <div className="group relative overflow-hidden rounded-md">
        <Link href={albumLink} className="block">
          <CoverArt
            src={coverUrl}
            alt={album.title}
            size={240}
            className="aspect-square h-auto w-full transition-opacity group-hover:opacity-90"
            rounded="md"
          />
        </Link>
        <PlayOnHoverFab
          href={parachordHref}
          label={`Play "${album.title}" by ${album.artist} in Parachord`}
        />
      </div>
      <div>
        <p className="truncate text-sm font-medium">
          <Link href={albumLink} className="hover:underline">
            {album.title}
          </Link>
        </p>
        <p className="text-muted-foreground truncate text-xs">
          <Link
            href={artistHref({ name: album.artist })}
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
