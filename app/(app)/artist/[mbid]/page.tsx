import { Suspense } from "react";
import { notFound } from "next/navigation";
import {
  bucketDiscography,
  getArtist,
  getArtistReleaseGroups,
  partitionArtistRelations,
  type ArtistDetail,
} from "@/lib/clients/musicbrainz";
import {
  getArtistListeners,
  getLbRadio,
  getSimilarArtists,
  getTopRecordingsForArtist,
  type ArtistListeners,
} from "@/lib/clients/listenbrainz";
import { findBioSource, getBiography } from "@/lib/clients/wikipedia";
import { PageShell } from "@/components/achordion/page-shell";
import { PageHeader } from "@/components/achordion/page-header";
import {
  EntityHeaderStats,
  EntityHeaderStatsSkeleton,
} from "@/components/achordion/entity-header-stats";
import { track } from "@vercel/analytics/server";
import {
  ArtistAvatar,
  resolveArtistImage,
} from "@/components/achordion/artist-avatar";
import { fanartArtistUrl } from "@/lib/clients/fanart";
import { TagChips } from "@/components/achordion/tag-chips";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { OpenInParachordButton } from "@/components/achordion/open-in-parachord-button";
import { SimilarArtists } from "@/components/achordion/similar-artists";
import { TopTracksList } from "@/components/achordion/top-tracks-list";
import { Skeleton } from "@/components/ui/skeleton";
import type { ParachordTrack } from "@/lib/parachord";

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
  // Wikipedia / WikiData hiccups (429s, 5xx) shouldn't take down
  // the artist page — bio is enrichment. Degrade to "no bio" on
  // any failure.
  const bio = await getBiography(source).catch(() => null);
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

  // Listener counts are best-effort and live behind a separate
  // ListenBrainz call. Don't block the header render on it — pass
  // the unawaited promise to a child Suspense boundary so the artist
  // name + avatar paints as soon as `getArtist` returns; the
  // numbers and the sidebar's top-listeners list fill in later.
  const listenersPromise = getArtistListeners(mbid).catch(() => null);

  const { urls } = partitionArtistRelations(artist);
  const bioSource = findBioSource(urls);
  // External links split three ways:
  //   streaming → favicon row right under the artist name
  //   social    → favicon row inside the bio block
  //   other     → wiki/discogs/lyrics/etc. in the sidebar
  const { streaming, social, other } = categoriseLinks(urls);

  // Resolve the artist hero image once at the page level so we can
  // (a) feed the chosen URL into <ArtistAvatar> via Next's fetch
  // dedupe (one upstream call shared with the avatar render), and
  // (b) credit fanart.tv in the sidebar when their image won the
  // resolution race. Per fanart.tv ToS we must link back to them
  // whenever we display their imagery.
  const heroImage = await resolveArtistImage(mbid, artist, 256);
  // Fire a lightweight analytics event so we can see, in the Vercel
  // Analytics dashboard, what fraction of artist pages get their hero
  // image from each source. `null` source = fell back to the DiceBear
  // shape placeholder. Only emitted from the artist detail page (one
  // event per page view), not from every avatar in lists/search —
  // the detail page is enough signal to compare coverage rates and
  // decide whether to add another fallback source later.
  void track("artist-image-resolved", {
    source: heroImage.source ?? "dicebear",
  }).catch(() => {});
  const otherWithCredits: ArtistExternalLink[] =
    heroImage.source === "fanart"
      ? [
          ...other,
          {
            type: "fanart.tv",
            url: fanartArtistUrl(artist.id),
          },
        ]
      : other;
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

  return (
    <>
      <PageHeader
        leading={
          heroImage.source === "fanart" ? (
            // fanart.tv ToS requires crediting their imagery with a
            // link back. We surface it three ways for redundancy:
            //   1. The hero avatar itself becomes a click-through to
            //      the fanart artist page (one obvious affordance).
            //   2. A hover tooltip names the source ("Photo by
            //      fanart.tv") so users know who provided the image
            //      without having to click.
            //   3. An "fanart.tv" entry lands in the sidebar's Other
            //      Links list, matching how every other reference
            //      source is credited.
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={fanartArtistUrl(artist.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${artist.name} photo on fanart.tv`}
                  className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <ArtistAvatar
                    mbid={artist.id}
                    name={artist.name}
                    artist={artist}
                    className="size-20 sm:size-24"
                    fallbackClassName="text-2xl"
                  />
                </a>
              </TooltipTrigger>
              <TooltipContent>Photo by fanart.tv</TooltipContent>
            </Tooltip>
          ) : (
            <ArtistAvatar
              mbid={artist.id}
              name={artist.name}
              artist={artist}
              className="size-20 sm:size-24"
              fallbackClassName="text-2xl"
            />
          )
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
          <Suspense fallback={<EntityHeaderStatsSkeleton />}>
            <ListenerStats promise={listenersPromise} />
          </Suspense>
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
      <div className="-mt-2 flex flex-wrap gap-1.5 pb-4">
        <TagChips entity="artist" mbid={artist.id} initialTags={tags} />
      </div>

      {/* Single grid that absorbs everything below the hero/tags so
          we can control mobile order independently from desktop
          placement. On lg+ the layout is the original 2-column
          (main + sidebar in row 1, discography + similar artists
          spanning both columns in subsequent rows). On mobile,
          DOM order = visual order, so we rearrange:
            1. main column content
            2. discography
            3. similar artists
            4. sidebar (info + top listeners) — pushed to the bottom

          The sidebar at the bottom on mobile keeps the artist's
          contextual facts (life-span / members / links / top
          listeners) reachable without forcing the user to scroll
          past them to get to the music. */}
      <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-w-0 space-y-12 lg:col-start-1 lg:row-start-1">
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
            <Suspense
              fallback={
                <>
                  <h2 className="mb-4 text-sm font-semibold tracking-wide uppercase">
                    Popular tracks
                  </h2>
                  <ListSkeleton />
                </>
              }
            >
              <TopTracksSection mbid={mbid} />
            </Suspense>
          </section>
        </div>

        {/* Discography — full-width on lg via col-span-2 col-start-1
            so it sits below both columns of the hero row. mt-16
            spacer is desktop-only; on mobile the gap-10 already
            separates it from the popular-tracks list above. */}
        <section className="lg:col-span-2 lg:col-start-1 lg:row-start-2 lg:mt-6">
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

        {/* Similar artists — full-width on lg. Wrapper div carries
            the grid placement so the inner <section> doesn't have to
            know about its layout context. */}
        <div className="lg:col-span-2 lg:col-start-1 lg:row-start-3">
          <Suspense fallback={<SimilarArtistsSkeleton />}>
            <SimilarArtistsSection mbid={mbid} />
          </Suspense>
        </div>

        {/* Sidebar — DOM-last so it's at the bottom on mobile.
            On lg, col-start-2 row-start-1 puts it back in the
            right column of the hero row. */}
        <div className="lg:col-start-2 lg:row-start-1">
          <Suspense
            fallback={
              <ArtistInfoSidebar
                artist={artist}
                linksOverride={otherWithCredits}
                // No topListeners during the initial paint — the section
                // gets hidden, fills in below when listeners resolves.
              />
            }
          >
            <SidebarWithListeners
              artist={artist}
              other={otherWithCredits}
              promise={listenersPromise}
            />
          </Suspense>
        </div>
      </div>
    </>
  );
}

/** Streams the artist's listens / listeners into the shared
 *  EntityHeaderStats block. Decoupled so the artist name + avatar
 *  can paint the moment `getArtist` resolves; the numbers fill in
 *  once the LB stats call returns. */
async function ListenerStats({
  promise,
}: {
  promise: Promise<ArtistListeners | null>;
}) {
  const listeners = await promise;
  return (
    <EntityHeaderStats
      totalListens={listeners?.total_listen_count}
      totalListeners={listeners?.total_user_count}
    />
  );
}


/** Awaits `listenersPromise` and renders the full sidebar including
 *  the top-listeners list. The Suspense fallback at the call site
 *  renders `<ArtistInfoSidebar>` with everything except the listeners
 *  list, so all the artist-info facts (life-span, members, links)
 *  paint immediately — only the top-listeners section streams in. */
async function SidebarWithListeners({
  artist,
  other,
  promise,
}: {
  artist: ArtistDetail;
  other: ArtistExternalLink[];
  promise: Promise<ArtistListeners | null>;
}) {
  const listeners = await promise;
  return (
    <ArtistInfoSidebar
      artist={artist}
      linksOverride={other}
      topListeners={listeners?.listeners}
    />
  );
}

async function LbRadioBlock({
  mbid,
  artistName,
}: {
  mbid: string;
  artistName: string;
}) {
  // LB Radio + similar/discography below are all enrichment — wrap
  // each so an upstream 429 / 5xx degrades the section to empty
  // instead of taking the artist page down with a generic 429.
  const tracks = await getLbRadio(`artist:(${mbid})`, "easy").catch(
    () => null,
  );
  return (
    <div className="my-6">
      <LbRadioSection seedLabel={artistName} tracks={tracks} />
    </div>
  );
}

async function SimilarArtistsSection({ mbid }: { mbid: string }) {
  // 8 instead of 12 — fits 4-up on lg, 2-up on mobile, and saves
  // server CPU cost. The "Fans also like" row is a discovery
  // hint, not exhaustive.
  const similar = await getSimilarArtists(mbid, 8).catch(() => []);
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
  const groups = await getArtistReleaseGroups(mbid).catch(() => []);
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
  const top = items.slice(0, 10);
  // Build a ParachordTrack array straight from LB's top-recordings
  // payload — title, artist, optional album. Hands the whole popular
  // 10 off to Parachord on a single click.
  const parachordTracks: ParachordTrack[] = top
    .map((r) => {
      if (!r.recording_name || !r.artist_name) return null;
      return {
        title: r.recording_name,
        artist: r.artist_name,
        ...(r.release_name ? { album: r.release_name } : {}),
      } as ParachordTrack;
    })
    .filter((t): t is ParachordTrack => t !== null);
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide uppercase">
          Popular tracks
        </h2>
        {parachordTracks.length > 0 && (
          <OpenInParachordButton
            kind="playlist"
            tracks={parachordTracks}
            label="Play all"
          />
        )}
      </div>
      <TopTracksList
        tracks={top.map((r) => ({
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
    </>
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
      <Suspense fallback={<ArtistPageSkeleton />}>
        <ArtistBody mbid={mbid} discographyType={discographyType} />
      </Suspense>
    </PageShell>
  );
}

/** Full-page skeleton shown during the initial `getArtist` wait.
 *  Mirrors the real layout (avatar circle + title block, sidebar,
 *  discography grid, similar-artists row) so the user sees the page
 *  shape immediately — perceived load time drops even when MB is
 *  rate-limited and the actual artist data is 10+ seconds out. */
function ArtistPageSkeleton() {
  return (
    <div className="space-y-12 pt-8">
      {/* Header: avatar + eyebrow / title / disambiguation + actions */}
      <div className="flex items-start gap-5">
        <Skeleton className="size-20 shrink-0 rounded-full sm:size-24" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-9 w-72 max-w-full" />
          <Skeleton className="h-4 w-48" />
          <div className="flex flex-wrap gap-1.5 pt-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-16 rounded-full" />
            ))}
          </div>
        </div>
      </div>

      {/* Body grid — bio + radio + popular tracks on the left, sidebar
          on the right, mirroring the real lg:grid-cols-[minmax(0,1fr)_240px]. */}
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-w-0 space-y-12">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
          <div>
            <Skeleton className="mb-4 h-3 w-32" />
            <div className="border-border/60 divide-border/60 divide-y rounded-xl border px-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-3">
                  <Skeleton className="size-4" />
                  <Skeleton className="size-10 rounded-md" />
                  <Skeleton className="h-4 flex-1" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <aside className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </aside>
      </div>

      {/* Discography */}
      <div>
        <Skeleton className="mb-4 h-3 w-32" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-square w-full rounded-md" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
