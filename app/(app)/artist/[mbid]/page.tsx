import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  bucketDiscography,
  getArtist,
  getArtistReleaseGroups,
  partitionArtistRelations,
} from "@/lib/clients/musicbrainz";
import {
  getArtistListeners,
  getLbRadio,
  getSimilarArtists,
  getTopRecordingsForArtist,
} from "@/lib/clients/listenbrainz";
import { findBioSource, getBiography } from "@/lib/clients/wikipedia";
import { PageShell } from "@/components/achordion/page-shell";
import { PageHeader } from "@/components/achordion/page-header";
import { ArtistAvatar } from "@/components/achordion/artist-avatar";
import { ArtistInfoSidebar } from "@/components/achordion/artist-info-sidebar";
import { Biography } from "@/components/achordion/biography";
import { Discography } from "@/components/achordion/discography";
import {
  ExternalLinks,
  categoriseLinks,
} from "@/components/achordion/external-links";
import { FilterPills } from "@/components/achordion/filter-pills";
import type { ArtistExternalLink } from "@/lib/clients/musicbrainz";
import { LbRadioSection } from "@/components/achordion/lb-radio-section";
import { SimilarArtists } from "@/components/achordion/similar-artists";
import { TopTracksList } from "@/components/achordion/top-tracks-list";
import { Skeleton } from "@/components/ui/skeleton";

const DISCOGRAPHY_TYPE_OPTIONS = [
  { value: "studio" as const, label: "Albums + EPs" },
  { value: "album" as const, label: "Albums" },
  { value: "ep" as const, label: "EPs" },
  { value: "single" as const, label: "Singles" },
  { value: "all" as const, label: "All" },
] as const;

type DiscographyType = (typeof DISCOGRAPHY_TYPE_OPTIONS)[number]["value"];

function parseDiscographyType(v: string | undefined): DiscographyType {
  return DISCOGRAPHY_TYPE_OPTIONS.some((o) => o.value === v)
    ? (v as DiscographyType)
    : "studio";
}

interface PageParams {
  params: Promise<{ mbid: string }>;
  searchParams: Promise<{ type?: string }>;
}

async function BiographySection({
  source,
  socialLinks,
}: {
  source: ReturnType<typeof findBioSource> & object;
  socialLinks: ArtistExternalLink[];
}) {
  const bio = await getBiography(source);
  const footer =
    socialLinks.length > 0 ? <ExternalLinks links={socialLinks} /> : null;
  if (!bio) return footer;
  return <Biography bio={bio} footer={footer} />;
}

async function ArtistBody({
  mbid,
  discographyType,
}: {
  mbid: string;
  discographyType: DiscographyType;
}) {
  let artist;
  try {
    artist = await getArtist(mbid);
  } catch {
    notFound();
  }

  // Listener counts are best-effort — most artists have them, but the
  // endpoint can 204/404 for niche/new artists. Fetch in parallel with
  // the rest of the page so it doesn't block first paint.
  const listenersPromise = getArtistListeners(mbid).catch(() => null);

  const { urls } = partitionArtistRelations(artist);
  const bioSource = findBioSource(urls);
  // External links split three ways:
  //   streaming → favicon row right under the artist name
  //   social    → favicon row inside the bio block
  //   other     → wiki/discogs/lyrics/etc. in the sidebar
  const { streaming, social, other } = categoriseLinks(urls);
  // Always include MusicBrainz itself in the bio block's social /
  // official sites row so users can jump to the MB entity page from
  // any artist regardless of which other reference links MB editors
  // have wired up. Type is "official homepage" so the dedupe + sort
  // pass treats it as a preferred entry.
  const socialWithMb: ArtistExternalLink[] = [
    ...social,
    {
      type: "official homepage",
      url: `https://musicbrainz.org/artist/${artist.id}`,
    },
  ];

  const tags = (artist.genres?.length ? artist.genres : artist.tags ?? [])
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const listeners = await listenersPromise;
  const totalListens = listeners?.total_listen_count;
  const totalListeners = listeners?.total_user_count;

  return (
    <>
      <PageHeader
        leading={
          <ArtistAvatar
            mbid={artist.id}
            name={artist.name}
            artist={artist}
            className="size-20 sm:size-24"
            fallbackClassName="text-2xl"
          />
        }
        eyebrow={artist.type ?? "Artist"}
        title={artist.name}
        description={
          artist.disambiguation ? <em>{artist.disambiguation}</em> : undefined
        }
        // No breadcrumb — artist is the top of the entity hierarchy and
        // we don't have an /artists directory page to crumb back to.
        // The "Artist" eyebrow already labels what kind of page this is.
        actions={
          totalListens !== undefined || totalListeners !== undefined ? (
            <div className="flex items-baseline gap-6 text-right">
              {totalListens !== undefined && (
                <div>
                  <p className="text-foreground text-2xl font-semibold tabular-nums">
                    {totalListens.toLocaleString()}
                  </p>
                  <p className="text-muted-foreground text-xs tracking-wide uppercase">
                    listens
                  </p>
                </div>
              )}
              {totalListeners !== undefined && (
                <div>
                  <p className="text-foreground text-2xl font-semibold tabular-nums">
                    {totalListeners.toLocaleString()}
                  </p>
                  <p className="text-muted-foreground text-xs tracking-wide uppercase">
                    listeners
                  </p>
                </div>
              )}
            </div>
          ) : undefined
        }
        afterTitle={
          /* Always render the streaming row so the "+ Add sources"
             tile is reachable even when MB has zero streaming rels
             on file for this artist. */
          <ExternalLinks
            links={streaming}
            addSources={{ mbEntity: "artist", mbid: artist.id }}
          />
        }
      />
      {tags.length > 0 && (
        <div className="-mt-2 flex flex-wrap gap-1.5 pb-4">
          {tags.map((t) => (
            <Link
              key={t.name}
              href={`/tag/${encodeURIComponent(t.name)}`}
              className="bg-muted text-muted-foreground hover:bg-foreground/15 hover:text-foreground rounded-full px-2.5 py-0.5 text-xs transition-colors"
            >
              {t.name}
            </Link>
          ))}
        </div>
      )}

      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_240px]">
        <div className="min-w-0 space-y-12">
          {bioSource ? (
            <Suspense
              fallback={<Skeleton className="h-32 w-full rounded-xl" />}
            >
              <BiographySection source={bioSource} socialLinks={socialWithMb} />
            </Suspense>
          ) : (
            <div className="border-border/60 bg-card/30 mb-6 rounded-xl border p-5">
              <ExternalLinks links={socialWithMb} />
            </div>
          )}

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
        </div>
        <ArtistInfoSidebar
          artist={artist}
          linksOverride={other}
          topListeners={listeners?.listeners}
        />
      </div>

      {/* Full-width sections — out of the 1fr/240px grid since the
          sidebar's content (life-span / members / links) ends well
          above where the discography starts. Lets the cover grid use
          the entire page width. */}
      <section className="mt-16">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold tracking-wide uppercase">
            Discography
          </h2>
          <FilterPills
            param="type"
            active={discographyType}
            options={DISCOGRAPHY_TYPE_OPTIONS}
            defaultValue="studio"
            ariaLabel="Discography type"
          />
        </div>
        <Suspense key={discographyType} fallback={<DiscographySkeleton />}>
          <DiscographySection mbid={mbid} type={discographyType} />
        </Suspense>
      </section>

      <Suspense fallback={<SimilarArtistsSkeleton />}>
        <SimilarArtistsSection mbid={mbid} />
      </Suspense>
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
      <LbRadioSection seedLabel={artistName} tracks={tracks} />
    </div>
  );
}

async function SimilarArtistsSection({ mbid }: { mbid: string }) {
  const similar = await getSimilarArtists(mbid, 12);
  // Hide the section entirely when there's nothing to show — the
  // heading was leaving an empty card visible for artists with no LB
  // similar-artists data on file.
  if (similar.length === 0) return null;
  return (
    <section className="mt-16">
      <h2 className="mb-6 text-sm font-semibold tracking-wide uppercase">
        Fans also like
      </h2>
      <SimilarArtists artists={similar} />
    </section>
  );
}

function SimilarArtistsSkeleton() {
  return (
    <section className="mt-16">
      <h2 className="mb-6 text-sm font-semibold tracking-wide uppercase">
        Fans also like
      </h2>
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
    </section>
  );
}

async function DiscographySection({
  mbid,
  type,
}: {
  mbid: string;
  type: DiscographyType;
}) {
  const groups = await getArtistReleaseGroups(mbid);
  const allBuckets = bucketDiscography(groups);
  const buckets = filterBucketsByType(allBuckets, type);
  return <Discography buckets={buckets} />;
}

function filterBucketsByType(
  buckets: ReturnType<typeof bucketDiscography>,
  type: DiscographyType,
): ReturnType<typeof bucketDiscography> {
  if (type === "all") return buckets;
  if (type === "album") return buckets.filter((b) => b.type === "Album");
  if (type === "ep") return buckets.filter((b) => b.type === "EP");
  if (type === "single") return buckets.filter((b) => b.type === "Single");
  // "studio" — Albums + EPs intermingled, sorted newest first.
  // Synthetic "Studio" bucket triggers the type-chip overlay on each
  // cover so users can tell formats apart at a glance (handled by
  // <Discography>).
  const studio = buckets
    .filter((b) => b.type === "Album" || b.type === "EP")
    .flatMap((b) => b.releaseGroups);
  if (studio.length === 0) return [];
  studio.sort((a, b) => {
    const da = a["first-release-date"] ?? "";
    const db = b["first-release-date"] ?? "";
    return db.localeCompare(da);
  });
  return [{ type: "Studio", releaseGroups: studio }];
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

export default async function ArtistPage({
  params,
  searchParams,
}: PageParams) {
  const { mbid } = await params;
  const sp = await searchParams;
  const discographyType = parseDiscographyType(sp.type);
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
        <ArtistBody mbid={mbid} discographyType={discographyType} />
      </Suspense>
    </PageShell>
  );
}
