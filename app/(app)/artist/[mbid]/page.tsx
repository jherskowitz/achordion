import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getArtist } from "@/lib/clients/musicbrainz";
import {
  getTopRecordingsForArtist,
  getTopReleaseGroupsForArtist,
} from "@/lib/clients/listenbrainz";
import { caaReleaseGroupUrl } from "@/lib/clients/coverart";
import { CoverArt } from "@/components/achordion/cover-art";
import { PageShell } from "@/components/achordion/page-shell";
import { PageHeader } from "@/components/achordion/page-header";
import { Skeleton } from "@/components/ui/skeleton";

interface PageParams {
  params: Promise<{ mbid: string }>;
}

function formatLifeSpan(begin?: string | null, end?: string | null, ended?: boolean | null) {
  if (!begin && !end) return null;
  if (begin && end) return `${begin} – ${end}`;
  if (begin && ended) return `${begin} – present`;
  if (begin) return `since ${begin}`;
  return null;
}

async function ArtistMeta({ mbid }: { mbid: string }) {
  let artist;
  try {
    artist = await getArtist(mbid);
  } catch {
    notFound();
  }
  const lifeSpan = formatLifeSpan(
    artist["life-span"]?.begin,
    artist["life-span"]?.end,
    artist["life-span"]?.ended,
  );
  const tags = (artist.tags ?? [])
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return (
    <>
      <PageHeader
        eyebrow={artist.type ?? "Artist"}
        title={artist.name}
        description={
          artist.disambiguation ? <em>{artist.disambiguation}</em> : undefined
        }
        breadcrumbs={[{ label: "Artists" }, { label: artist.name }]}
        actions={
          <div className="text-muted-foreground space-y-1 text-right text-xs">
            {lifeSpan && <p>{lifeSpan}</p>}
            {artist.country && <p>{artist.country}</p>}
          </div>
        }
      />
      {tags.length > 0 && (
        <div className="-mt-2 flex flex-wrap gap-1.5 pb-4">
          {tags.map((t) => (
            <span
              key={t.name}
              className="bg-muted text-muted-foreground rounded-full px-2.5 py-0.5 text-xs"
            >
              {t.name}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

async function TopAlbums({ mbid }: { mbid: string }) {
  const items = await getTopReleaseGroupsForArtist(mbid);
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No popular albums yet.</p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {items.slice(0, 12).map((rg) => (
        <Link
          key={rg.release_group_mbid}
          href={`/release-group/${rg.release_group_mbid}`}
          className="group min-w-0"
        >
          <CoverArt
            src={caaReleaseGroupUrl(rg.release_group_mbid, 250)}
            alt={rg.release_group_name}
            size={240}
            className="aspect-square h-auto w-full transition-opacity group-hover:opacity-90"
            rounded="md"
          />
          <p className="mt-2 truncate text-sm font-medium">
            {rg.release_group_name}
          </p>
          {rg.total_listen_count !== undefined && (
            <p className="text-muted-foreground text-xs">
              {rg.total_listen_count.toLocaleString()} listens
            </p>
          )}
        </Link>
      ))}
    </div>
  );
}

async function TopTracks({ mbid }: { mbid: string }) {
  const items = await getTopRecordingsForArtist(mbid);
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No popular tracks yet.</p>
    );
  }
  return (
    <ol className="border-border/60 divide-border/60 divide-y rounded-xl border px-4">
      {items.slice(0, 10).map((r, i) => (
        <li
          key={r.recording_mbid}
          className="flex items-center gap-3 py-3"
        >
          <span className="text-muted-foreground w-5 shrink-0 text-xs tabular-nums">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <Link
              href={`/recording/${r.recording_mbid}`}
              className="block truncate text-sm font-medium hover:underline"
            >
              {r.recording_name}
            </Link>
            {r.release_name && (
              <p className="text-muted-foreground truncate text-xs">
                {r.release_name}
              </p>
            )}
          </div>
          {r.total_listen_count !== undefined && (
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {r.total_listen_count.toLocaleString()}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="aspect-square w-full rounded-md" />
          <Skeleton className="h-3.5 w-3/4" />
        </div>
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <ol className="border-border/60 divide-border/60 divide-y rounded-xl border px-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 py-3">
          <Skeleton className="size-4" />
          <Skeleton className="h-4 flex-1" />
        </li>
      ))}
    </ol>
  );
}

export default async function ArtistPage({ params }: PageParams) {
  const { mbid } = await params;
  return (
    <PageShell>
      <Suspense
        fallback={
          <div className="space-y-3 pt-8 pb-6">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-10 w-72" />
            <Skeleton className="h-4 w-40" />
          </div>
        }
      >
        <ArtistMeta mbid={mbid} />
      </Suspense>

      <section className="mt-10">
        <h2 className="mb-4 text-sm font-semibold tracking-wide uppercase">
          Popular tracks
        </h2>
        <Suspense fallback={<ListSkeleton />}>
          <TopTracks mbid={mbid} />
        </Suspense>
      </section>

      <section className="mt-10">
        <h2 className="mb-4 text-sm font-semibold tracking-wide uppercase">
          Popular albums
        </h2>
        <Suspense fallback={<GridSkeleton />}>
          <TopAlbums mbid={mbid} />
        </Suspense>
      </section>
    </PageShell>
  );
}
