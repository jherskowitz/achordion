import Link from "next/link";
import {
  getUserTopArtists,
  getUserTopRecordings,
  getUserTopReleaseGroups,
} from "@/lib/clients/listenbrainz";
import { caaReleaseGroupUrl, caaReleaseUrl } from "@/lib/clients/coverart";
import { CoverArt } from "./cover-art";
import {
  artistHref,
  recordingHref,
  releaseGroupHref,
} from "@/lib/entity-links";

interface ArtistEntry {
  artist_name: string;
  artist_mbid?: string | null;
  listen_count: number;
}

interface AlbumEntry {
  release_group_name: string;
  release_group_mbid?: string | null;
  artist_name: string;
  artist_mbids?: string[];
  listen_count: number;
  caa_id?: number | string | null;
  caa_release_mbid?: string | null;
}

interface TrackEntry {
  track_name: string;
  recording_mbid?: string | null;
  artist_name: string;
  artist_mbids?: string[];
  release_mbid?: string | null;
  listen_count: number;
  caa_id?: number | string | null;
  caa_release_mbid?: string | null;
}

function albumCover(a: AlbumEntry): string | null {
  if (a.caa_release_mbid && a.caa_id) {
    return `https://archive.org/download/mbid-${a.caa_release_mbid}/mbid-${a.caa_release_mbid}-${a.caa_id}_thumb250.jpg`;
  }
  if (a.release_group_mbid) return caaReleaseGroupUrl(a.release_group_mbid, 250);
  return null;
}

function trackCover(t: TrackEntry): string | null {
  if (t.caa_release_mbid && t.caa_id) {
    return `https://archive.org/download/mbid-${t.caa_release_mbid}/mbid-${t.caa_release_mbid}-${t.caa_id}_thumb250.jpg`;
  }
  if (t.release_mbid) return caaReleaseUrl(t.release_mbid, 250);
  return null;
}

function ArtistRow({ entry, max }: { entry: ArtistEntry; max: number }) {
  const pct = Math.round((entry.listen_count / max) * 100);
  return (
    <li className="text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate">
          <Link
            href={artistHref({
              mbid: entry.artist_mbid,
              name: entry.artist_name,
            })}
            className="hover:underline"
          >
            {entry.artist_name}
          </Link>
        </span>
        <span className="text-muted-foreground/70 shrink-0 tabular-nums text-xs">
          {entry.listen_count}
        </span>
      </div>
      <div className="bg-muted mt-1 h-0.5 w-full overflow-hidden rounded-full">
        <div
          className="bg-foreground/60 h-full"
          style={{ width: `${pct}%` }}
        />
      </div>
    </li>
  );
}

function AlbumRow({ entry }: { entry: AlbumEntry }) {
  const cover = albumCover(entry);
  // Cover + album-title share one link, artist sits as a sibling
  // (nested-anchor avoidance) so both are independently clickable.
  const albumLink = releaseGroupHref({
    mbid: entry.release_group_mbid,
    artist: entry.artist_name,
    title: entry.release_group_name,
  });
  const artistLink = artistHref({
    mbid: entry.artist_mbids?.[0],
    name: entry.artist_name,
  });
  return (
    <li className="flex items-center gap-2.5">
      <Link href={albumLink} className="shrink-0">
        <CoverArt src={cover} alt={entry.release_group_name} size={36} />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          <Link href={albumLink} className="hover:underline">
            {entry.release_group_name}
          </Link>
        </p>
        <p className="text-muted-foreground truncate text-xs">
          <Link href={artistLink} className="hover:text-foreground">
            {entry.artist_name}
          </Link>
        </p>
      </div>
      <span className="text-muted-foreground/70 shrink-0 tabular-nums text-xs">
        {entry.listen_count}
      </span>
    </li>
  );
}

function TrackRow({ entry }: { entry: TrackEntry }) {
  const cover = trackCover(entry);
  const trackLink = recordingHref({
    mbid: entry.recording_mbid,
    artist: entry.artist_name,
    title: entry.track_name,
  });
  const artistLink = artistHref({
    mbid: entry.artist_mbids?.[0],
    name: entry.artist_name,
  });
  return (
    <li className="flex items-center gap-2.5">
      <Link href={trackLink} className="shrink-0">
        <CoverArt src={cover} alt={entry.track_name} size={36} />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          <Link href={trackLink} className="hover:underline">
            {entry.track_name}
          </Link>
        </p>
        <p className="text-muted-foreground truncate text-xs">
          <Link href={artistLink} className="hover:text-foreground">
            {entry.artist_name}
          </Link>
        </p>
      </div>
      <span className="text-muted-foreground/70 shrink-0 tabular-nums text-xs">
        {entry.listen_count}
      </span>
    </li>
  );
}

function SectionHeader({
  title,
  href,
}: {
  title: string;
  href: string;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h3 className="text-muted-foreground text-xs tracking-wide uppercase">
        {title}
      </h3>
      <Link
        href={href}
        className="text-muted-foreground/70 hover:text-foreground text-xs underline-offset-4 hover:underline"
      >
        all →
      </Link>
    </div>
  );
}

export async function WeeklyStatsSidebar({ name }: { name: string }) {
  const [artists, albums, tracks] = await Promise.all([
    getUserTopArtists(name, "week", 5).catch(() => []),
    getUserTopReleaseGroups(name, "week", 5).catch(() => []),
    getUserTopRecordings(name, "week", 5).catch(() => []),
  ]);

  const hasAny =
    artists.length > 0 || albums.length > 0 || tracks.length > 0;
  if (!hasAny) {
    return (
      <div className="border-border/60 rounded-xl border p-4">
        <p className="text-muted-foreground text-xs tracking-wide uppercase">
          This week
        </p>
        <p className="text-muted-foreground mt-2 text-sm">
          No listens recorded in the last week.
        </p>
      </div>
    );
  }

  const maxArtist = artists[0]?.listen_count ?? 1;

  return (
    <div className="border-border/60 space-y-6 rounded-xl border p-4">
      <p className="text-muted-foreground text-xs tracking-wide uppercase">
        This week
      </p>

      {artists.length > 0 && (
        <section>
          <SectionHeader
            title="Top artists"
            href={`/user/${name}/stats?range=week`}
          />
          <ol className="space-y-2.5">
            {artists.map((a) => (
              <ArtistRow
                key={`${a.artist_mbid ?? a.artist_name}`}
                entry={a}
                max={maxArtist}
              />
            ))}
          </ol>
        </section>
      )}

      {albums.length > 0 && (
        <section>
          <SectionHeader
            title="Top albums"
            href={`/user/${name}/stats?range=week`}
          />
          <ol className="space-y-2.5">
            {albums.map((a) => (
              <AlbumRow
                key={`${a.release_group_mbid ?? a.release_group_name}`}
                entry={a}
              />
            ))}
          </ol>
        </section>
      )}

      {tracks.length > 0 && (
        <section>
          <SectionHeader
            title="Top tracks"
            href={`/user/${name}/stats?range=week`}
          />
          <ol className="space-y-2.5">
            {tracks.map((t) => (
              <TrackRow
                key={`${t.recording_mbid ?? t.track_name}`}
                entry={t}
              />
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

export function WeeklyStatsSidebarSkeleton() {
  return (
    <div className="border-border/60 space-y-4 rounded-xl border p-4">
      <div className="bg-muted h-3 w-20 rounded" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="bg-muted h-3 w-16 rounded" />
          {Array.from({ length: 4 }).map((__, j) => (
            <div key={j} className="bg-muted/50 h-8 rounded" />
          ))}
        </div>
      ))}
    </div>
  );
}
