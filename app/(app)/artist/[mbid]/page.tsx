import { Suspense } from "react";
import { notFound } from "next/navigation";
import {
  bucketDiscography,
  getArtist,
  getArtistReleaseGroups,
  partitionArtistRelations,
} from "@/lib/clients/musicbrainz";
import {
  getLbRadio,
  getSimilarArtists,
  getTopRecordingsForArtist,
} from "@/lib/clients/listenbrainz";
import { findBioSource, getBiography } from "@/lib/clients/wikipedia";
import { PageShell } from "@/components/achordion/page-shell";
import { PageHeader } from "@/components/achordion/page-header";
import { ArtistInfoSidebar } from "@/components/achordion/artist-info-sidebar";
import { Biography } from "@/components/achordion/biography";
import { Discography } from "@/components/achordion/discography";
import { LbRadioSection } from "@/components/achordion/lb-radio-section";
import { SimilarArtists } from "@/components/achordion/similar-artists";
import { TopTracksList } from "@/components/achordion/top-tracks-list";
import { Skeleton } from "@/components/ui/skeleton";

interface PageParams {
  params: Promise<{ mbid: string }>;
}

async function BiographySection({
  source,
}: {
  source: ReturnType<typeof findBioSource> & object;
}) {
  const bio = await getBiography(source);
  if (!bio) return null;
  return <Biography bio={bio} />;
}

async function ArtistBody({ mbid }: { mbid: string }) {
  let artist;
  try {
    artist = await getArtist(mbid);
  } catch {
    notFound();
  }

  const { urls } = partitionArtistRelations(artist);
  const bioSource = findBioSource(urls);

  const tags = (artist.genres?.length ? artist.genres : artist.tags ?? [])
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const lifeSpan = (() => {
    const begin = artist["life-span"]?.begin;
    const end = artist["life-span"]?.end;
    const ended = artist["life-span"]?.ended;
    if (!begin && !end) return null;
    if (begin && end) return `${begin} – ${end}`;
    if (begin && ended) return `${begin} – present`;
    if (begin) return `since ${begin}`;
    return null;
  })();

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

      {bioSource && (
        <Suspense fallback={<Skeleton className="mb-6 h-32 w-full rounded-xl" />}>
          <BiographySection source={bioSource} />
        </Suspense>
      )}

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_240px]">
        <div className="min-w-0 space-y-12">
          <Suspense
            fallback={<Skeleton className="h-24 w-full rounded-2xl" />}
          >
            <LbRadioBlock mbid={mbid} artistName={artist.name} />
          </Suspense>

          <section>
            <h2 className="mb-4 text-sm font-semibold tracking-wide uppercase">
              Popular tracks
            </h2>
            <Suspense fallback={<ListSkeleton />}>
              <TopTracksSection mbid={mbid} />
            </Suspense>
          </section>

          <section>
            <h2 className="mb-6 text-sm font-semibold tracking-wide uppercase">
              Discography
            </h2>
            <Suspense fallback={<DiscographySkeleton />}>
              <DiscographySection mbid={mbid} />
            </Suspense>
          </section>
        </div>
        <ArtistInfoSidebar artist={artist} />
      </div>

      <section className="mt-16">
        <h2 className="mb-6 text-sm font-semibold tracking-wide uppercase">
          Fans also like
        </h2>
        <Suspense fallback={<SimilarArtistsSkeleton />}>
          <SimilarArtistsSection mbid={mbid} />
        </Suspense>
      </section>
    </>
  );
}

async function LbRadioBlock({
  mbid,
  artistName,
}: {
  mbid: string;
  artistName: string;
}) {
  const tracks = await getLbRadio(`artist:(${mbid})`, "easy");
  return (
    <div className="my-6">
      <LbRadioSection
        artistMbid={mbid}
        artistName={artistName}
        tracks={tracks}
      />
    </div>
  );
}

async function SimilarArtistsSection({ mbid }: { mbid: string }) {
  const similar = await getSimilarArtists(mbid, 12);
  if (similar.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No similar artists on file.
      </p>
    );
  }
  return <SimilarArtists artists={similar} />;
}

function SimilarArtistsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="border-border/60 space-y-2 rounded-xl border p-4"
        >
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-full" />
        </div>
      ))}
    </div>
  );
}

async function DiscographySection({ mbid }: { mbid: string }) {
  const groups = await getArtistReleaseGroups(mbid);
  const buckets = bucketDiscography(groups);
  return <Discography buckets={buckets} />;
}

async function TopTracksSection({ mbid }: { mbid: string }) {
  const items = await getTopRecordingsForArtist(mbid);
  return (
    <TopTracksList
      tracks={items.slice(0, 10).map((r) => ({
        track_name: r.recording_name,
        recording_mbid: r.recording_mbid,
        artist_name: r.artist_name,
        artist_mbids: r.artist_mbids,
        release_name: r.release_name,
        release_mbid: r.release_mbid,
        listen_count: r.total_listen_count ?? 0,
        caa_id: r.caa_id,
        caa_release_mbid: r.caa_release_mbid,
      }))}
    />
  );
}

function DiscographySkeleton() {
  return (
    <div className="space-y-12">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i}>
          <Skeleton className="mb-4 h-3 w-20" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, j) => (
              <div key={j} className="space-y-2">
                <Skeleton className="aspect-square w-full rounded-md" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ))}
          </div>
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
          <Skeleton className="size-10 rounded-md" />
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
        <ArtistBody mbid={mbid} />
      </Suspense>
    </PageShell>
  );
}
