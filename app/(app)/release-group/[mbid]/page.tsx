import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  formatArtistCredit,
  getRelease,
  getReleaseGroup,
  partitionArtistRelations,
  pickCanonicalRelease,
  withLookupDeadline,
  type ReleaseDetail,
} from "@/lib/clients/musicbrainz";
import { parachordPlayAlbum, type ParachordTrack } from "@/lib/parachord";
import { getTopRecordingsForArtist } from "@/lib/clients/listenbrainz";
import { caaReleaseGroupUrl } from "@/lib/clients/coverart";
import { mergeTagsAndGenres } from "@/lib/merge-tags-genres";
import { PageHeader } from "@/components/achordion/page-header";
import { PageShell } from "@/components/achordion/page-shell";
import { CoverArt } from "@/components/achordion/cover-art";
import { PlayOnHoverFab } from "@/components/achordion/play-on-hover-fab";
import { TrackList } from "@/components/achordion/track-list";
import {
  EntityHeaderListenerStats,
  EntityTopListeners,
} from "@/components/achordion/entity-listener-stats";
import {
  ExternalLinks,
  categoriseLinks,
  normalizeStreamingUrl,
  tooltipLabel,
} from "@/components/achordion/external-links";
import { StreamingLinksRow } from "@/components/achordion/streaming-links-row";
import { TrackListActionsMenu } from "@/components/achordion/track-list-actions-menu";
import { EmbedShareButton } from "@/components/achordion/embed-share-button";
import { TagChips } from "@/components/achordion/tag-chips";
import { EmptyState } from "@/components/achordion/empty-state";
import { AlbumReviews } from "@/components/achordion/album-reviews";
import { Skeleton } from "@/components/ui/skeleton";

interface PageParams {
  params: Promise<{ mbid: string }>;
}

/** Pure mapper: per-track listen counts from the artist's top
 *  recordings, keyed to the release's track recording-MBIDs. The
 *  artist-recordings fetch is started in `AlbumBody` (concurrently
 *  with `getRelease`) and the result passed in here. Listen counts are
 *  an enrichment — an empty `recordings` (LB hiccup) just yields an
 *  empty map, never an error. */
function buildListenCountMap(
  release: ReleaseDetail,
  recordings: Awaited<ReturnType<typeof getTopRecordingsForArtist>>,
): Map<string, number> {
  const trackIds = new Set<string>();
  for (const m of release.media ?? []) {
    for (const t of m.tracks ?? []) {
      if (t.recording?.id) trackIds.add(t.recording.id);
    }
  }
  const map = new Map<string, number>();
  for (const r of recordings) {
    if (trackIds.has(r.recording_mbid) && r.total_listen_count !== undefined) {
      map.set(r.recording_mbid, r.total_listen_count);
    }
  }
  return map;
}

async function AlbumBody({ mbid }: { mbid: string }) {
  let rg;
  try {
    rg = await getReleaseGroup(mbid);
  } catch {
    notFound();
  }

  const credit = formatArtistCredit(rg["artist-credit"]);
  const canonical = pickCanonicalRelease(rg);

  // FIRST-PAINT SPLIT. The header below needs only `rg` (cover, title,
  // artist, type/year, tags), so we render it the moment
  // getReleaseGroup resolves and DON'T block it on the release fetch.
  // `getRelease` (tracklist + release-level links) and the artist's top
  // recordings (per-track listen counts) are kicked off here as
  // unawaited promises and consumed by Suspense'd children, so they
  // stream in without gating first paint. On a cold (cache-miss) album
  // this turns ~3 serialized 1-req/sec MB calls before any paint into
  // one. Both promises depend only on `rg`, so they run concurrently.
  // Deadline-bound both streamed promises: `.catch` only saves us from
  // an *error*, not a *hang* — a stuck MB/LB call (no error, no resolve)
  // would keep the Suspense child, and the whole function, alive to
  // maxDuration (a billed timeout). The deadline throws into the catch
  // so each degrades fast (empty tracklist / no listen counts).
  const releasePromise = canonical
    ? withLookupDeadline(getRelease(canonical.id)).catch(() => null)
    : Promise.resolve(null);
  type Recordings = Awaited<ReturnType<typeof getTopRecordingsForArtist>>;
  const recordingsPromise: Promise<Recordings> = credit.primaryArtistId
    ? withLookupDeadline(
        getTopRecordingsForArtist(credit.primaryArtistId),
      ).catch(() => [] as Recordings)
    : Promise.resolve([] as Recordings);

  // Header streaming favicons seed from the release-group's OWN MB
  // url-rels only — release-level rels stream in with the tracklist,
  // and the <StreamingLinksRow> client island enriches via Odesli /
  // cache after mount regardless, so first paint isn't gated on
  // getRelease.
  const rgStreaming = categoriseLinks(
    partitionArtistRelations(rg).urls,
  ).streaming;
  const initialStreamingItems = rgStreaming
    .map((link) => {
      const normalised = normalizeStreamingUrl(link.url);
      if (!normalised) return null;
      let host: string;
      try {
        host = new URL(normalised).hostname.toLowerCase();
      } catch {
        return null;
      }
      return { url: normalised, label: tooltipLabel(link), host };
    })
    .filter((x): x is { url: string; label: string; host: string } => x !== null);
  const albumOdesliSeed = rgStreaming[0]?.url ?? null;

  // Artist › Album breadcrumb. Primary credited artist only, so guest
  // features in the byline don't pollute the trail.
  const primary = credit.parts[0];
  const breadcrumbs = primary
    ? [
        {
          label: primary.name,
          ...(primary.id ? { href: `/artist/${primary.id}` } : {}),
        },
        { label: rg.title },
      ]
    : [];

  // Union genres + tags so user-added tags don't get hidden behind
  // the curated-genre list. See lib/merge-tags-genres.ts.
  const tags = mergeTagsAndGenres(rg.tags, rg.genres);
  const year = rg["first-release-date"]?.slice(0, 4);
  const albumType =
    rg["primary-type"] ??
    (rg["secondary-types"]?.length ? rg["secondary-types"][0] : "Release");

  return (
    <>
      {/* Track-page-mirroring header: cover with hover play fab,
          title + artist byline, ⋮ list-actions menu inline with
          the streaming favicons row, listens/listeners stats
          right-justified. Tag chips + Embed share button render
          BELOW the header in their own row, same as the
          recording page. */}
      <PageHeader
        breadcrumbs={breadcrumbs}
        leading={
          <div className="group relative aspect-square w-32 overflow-hidden rounded-md sm:w-40">
            <CoverArt
              src={caaReleaseGroupUrl(rg.id, 500)}
              alt={rg.title}
              size={500}
              className="aspect-square w-full transition-opacity group-hover:opacity-90"
              rounded="md"
            />
            {/* Play by release-group MBID — no track list needed, so
                the fab works on first paint before getRelease. */}
            <PlayOnHoverFab
              href={parachordPlayAlbum({ mbid: rg.id })}
              label={`Play "${rg.title}" by ${credit.name} in Parachord`}
            />
          </div>
        }
        eyebrow={
          <>
            {albumType}
            {rg["secondary-types"]?.length ? (
              <> · {rg["secondary-types"].join(" · ")}</>
            ) : null}
          </>
        }
        title={rg.title}
        description={
          <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1">
            {credit.parts.map((p, i) => (
              <span key={`${p.id ?? p.name}-${i}`}>
                {p.id ? (
                  <Link
                    href={`/artist/${p.id}`}
                    className="text-foreground hover:underline"
                  >
                    {p.name}
                  </Link>
                ) : (
                  p.name
                )}
                {p.join}
              </span>
            ))}
            {year && (
              <>
                <span className="text-muted-foreground/70">·</span>
                <span className="text-muted-foreground tabular-nums">
                  {year}
                </span>
              </>
            )}
            {rg.disambiguation && (
              <>
                <span className="text-muted-foreground/70">·</span>
                <em className="text-muted-foreground">{rg.disambiguation}</em>
              </>
            )}
          </span>
        }
        afterTitle={
          <div className="flex flex-wrap items-center gap-2">
            {/* Actions menu needs the full track list (release fetch),
                so it streams in rather than blocking the header. */}
            <Suspense fallback={null}>
              <AlbumActionsMenu
                promise={releasePromise}
                albumTitle={rg.title}
                creditName={credit.name}
              />
            </Suspense>
            <StreamingLinksRow
              entity="release-group"
              mbid={rg.id}
              initialItems={initialStreamingItems}
              seedUrl={albumOdesliSeed}
            />
            <EmbedShareButton
              entity="album"
              mbid={rg.id}
              entityName={rg.title}
              artistName={credit.name}
            />
          </div>
        }
        actions={
          <EntityHeaderListenerStats
            endpoint={`/api/release-group/${mbid}/listeners`}
          />
        }
      />

      <div className="-mt-2 flex flex-wrap gap-1.5 pb-4">
        <TagChips entity="release-group" mbid={rg.id} initialTags={tags} />
      </div>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-w-0 space-y-12">
          <section>
            <h2 className="mb-4 text-sm font-semibold tracking-wide uppercase">
              Tracks
            </h2>
            <Suspense fallback={<TracksSkeleton />}>
              <AlbumTracks
                releasePromise={releasePromise}
                recordingsPromise={recordingsPromise}
              />
            </Suspense>
          </section>

          {/* Per-user reviews block. Renders nothing for viewers
              without the feature flag; otherwise streams in CB/
              Wikipedia content from the per-user API endpoint after
              hydration. See `components/achordion/album-reviews.tsx`. */}
          <AlbumReviews mbid={mbid} />
        </div>

        <aside className="space-y-8">
          <EntityTopListeners
            endpoint={`/api/release-group/${mbid}/listeners`}
          />
          {/* Other Links merges rg-level + release-level url-rels, so
              it streams in with the release fetch rather than blocking
              the sidebar. */}
          <Suspense fallback={null}>
            <AlbumOtherLinks promise={releasePromise} rg={rg} mbid={mbid} />
          </Suspense>
        </aside>
      </div>
    </>
  );
}

/** Streams the Parachord actions menu into the header once the release
 *  (and thus the full track list) resolves. */
async function AlbumActionsMenu({
  promise,
  albumTitle,
  creditName,
}: {
  promise: Promise<ReleaseDetail | null>;
  albumTitle: string;
  creditName: string;
}) {
  const release = await promise;
  const tracks: ParachordTrack[] = release
    ? (release.media ?? [])
        .flatMap((m) => m.tracks ?? [])
        .map((t): ParachordTrack => {
          const trackArtist =
            formatArtistCredit(t["artist-credit"]).name || creditName;
          const lengthMs = t.length ?? t.recording?.length;
          return {
            title: t.title,
            artist: trackArtist,
            album: albumTitle,
            ...(lengthMs ? { duration: Math.round(lengthMs / 1000) } : {}),
          };
        })
    : [];
  return (
    <TrackListActionsMenu
      title={`${albumTitle} — ${creditName}`}
      creator={creditName}
      tracks={tracks}
      triggerLabel={`${albumTitle} actions`}
    />
  );
}

/** Streams the track list. Awaits the release + the artist's top
 *  recordings concurrently (both kicked off in AlbumBody), then maps
 *  per-track listen counts. */
async function AlbumTracks({
  releasePromise,
  recordingsPromise,
}: {
  releasePromise: Promise<ReleaseDetail | null>;
  recordingsPromise: Promise<Awaited<ReturnType<typeof getTopRecordingsForArtist>>>;
}) {
  const [release, recordings] = await Promise.all([
    releasePromise,
    recordingsPromise,
  ]);
  if (!release) {
    return (
      <EmptyState
        title="No track listing"
        description="MusicBrainz doesn't have a release on file we can show tracks from."
      />
    );
  }
  return (
    <TrackList
      release={release}
      listenCounts={buildListenCountMap(release, recordings)}
    />
  );
}

/** Streams the sidebar's "Other Links" — merges the release-group's
 *  url-rels with the canonical release's (MB editors attach links to
 *  either), plus the MB entry link. */
async function AlbumOtherLinks({
  promise,
  rg,
  mbid,
}: {
  promise: Promise<ReleaseDetail | null>;
  rg: Awaited<ReturnType<typeof getReleaseGroup>>;
  mbid: string;
}) {
  const release = await promise;
  const rgUrls = partitionArtistRelations(rg).urls;
  const releaseUrls = release
    ? partitionArtistRelations({ relations: release.relations }).urls
    : [];
  const urls = Array.from(
    new Map([...rgUrls, ...releaseUrls].map((l) => [l.url, l])).values(),
  );
  const { other: otherUrlsFromMb } = categoriseLinks(urls);
  const mbReleaseGroupUrl = `https://musicbrainz.org/release-group/${mbid}`;
  const otherUrls = otherUrlsFromMb.some((l) => l.url === mbReleaseGroupUrl)
    ? otherUrlsFromMb
    : [
        ...otherUrlsFromMb,
        { type: "musicbrainz entry", url: mbReleaseGroupUrl },
      ];
  if (otherUrls.length === 0) return null;
  return (
    <div>
      {/* h2 (sidebar): sibling of the main column's "Tracks" h2. */}
      <h2 className="mb-3 text-xs tracking-wide uppercase text-muted-foreground">
        Other Links
      </h2>
      <ExternalLinks links={otherUrls} />
    </div>
  );
}

/** Tracklist skeleton for the streamed <AlbumTracks> boundary. */
function TracksSkeleton() {
  return (
    <div className="border-border/60 divide-border/60 divide-y rounded-xl border px-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-3">
          <Skeleton className="size-4" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-3 w-12" />
        </div>
      ))}
    </div>
  );
}

export async function generateMetadata({ params }: PageParams) {
  const { mbid } = await params;
  try {
    const rg = await getReleaseGroup(mbid);
    const credit = formatArtistCredit(rg["artist-credit"]);
    const year = rg["first-release-date"]?.slice(0, 4);
    const title = credit.name ? `${rg.title} — ${credit.name}` : rg.title;
    const description = credit.name
      ? `${rg.title}${year ? ` (${year})` : ""} by ${credit.name} on Achordion. Play any track on Spotify, Apple Music, Bandcamp, or any other service you use.`
      : `${rg.title} on Achordion.`;
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "music.album",
      },
      twitter: {
        card: "summary_large_image" as const,
        title,
        description,
      },
    };
  } catch {
    return { title: "Album" };
  }
}

export default async function ReleaseGroupPage({ params }: PageParams) {
  const { mbid } = await params;
  return (
    <PageShell>
      <Suspense fallback={<AlbumPageSkeleton mbid={mbid} />}>
        <AlbumBody mbid={mbid} />
      </Suspense>
    </PageShell>
  );
}

/** Full-page skeleton during the initial `getReleaseGroup` wait.
 *  Mirrors the real layout — cover + title block, two-column body
 *  with tracklist on the left and sidebar on the right — so the
 *  user sees the page shape immediately rather than a blank canvas
 *  when MB is rate-limited.
 *
 *  The cover art renders for real even here: `caaReleaseGroupUrl` is
 *  derived straight from the mbid (no fetch), so the artwork is
 *  visible on the very first frame — before getReleaseGroup returns. */
function AlbumPageSkeleton({ mbid }: { mbid: string }) {
  return (
    <div className="space-y-10 pt-8">
      {/* Header: cover + breadcrumb / title / artist / stats */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-8">
        <CoverArt
          src={caaReleaseGroupUrl(mbid, 500)}
          alt=""
          size={500}
          className="aspect-square w-full max-w-[280px] rounded-md sm:max-w-none"
          rounded="md"
        />
        <div className="space-y-3">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-10 w-80 max-w-full" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-44" />
          <div className="flex flex-wrap gap-1.5 pt-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-16 rounded-full" />
            ))}
          </div>
        </div>
      </div>
      {/* Body grid */}
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-w-0">
          <Skeleton className="mb-4 h-3 w-16" />
          <div className="border-border/60 divide-border/60 divide-y rounded-xl border px-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-3">
                <Skeleton className="size-4" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
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
    </div>
  );
}
