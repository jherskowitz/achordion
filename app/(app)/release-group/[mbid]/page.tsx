import { Suspense } from "react";
import { notFound } from "next/navigation";
import {
  formatArtistCredit,
  getRelease,
  getReleaseGroup,
  partitionArtistRelations,
  pickCanonicalRelease,
  type ReleaseDetail,
} from "@/lib/clients/musicbrainz";
import type { ParachordTrack } from "@/lib/parachord";
import {
  getReleaseGroupListeners,
  getTopRecordingsForArtist,
  type ReleaseGroupListeners,
} from "@/lib/clients/listenbrainz";
import { PageShell } from "@/components/achordion/page-shell";
import { AlbumHeader } from "@/components/achordion/album-header";
import { Breadcrumbs } from "@/components/achordion/breadcrumbs";
import { TrackList } from "@/components/achordion/track-list";
import { TopListenersList } from "@/components/achordion/top-listeners-list";
import {
  ExternalLinks,
  categoriseLinks,
} from "@/components/achordion/external-links";
import { EmptyState } from "@/components/achordion/empty-state";
import { AlbumReviews } from "@/components/achordion/album-reviews";
import { Skeleton } from "@/components/ui/skeleton";

interface PageParams {
  params: Promise<{ mbid: string }>;
}

async function fetchListenCounts(
  release: ReleaseDetail,
  artistId: string | null,
): Promise<Map<string, number>> {
  if (!artistId) return new Map();
  // Listen counts are an enrichment, never load-bearing — degrade
  // to empty on any LB hiccup (429, transient 5xx) rather than
  // taking the whole album page down with a generic error.
  const recordings = await getTopRecordingsForArtist(artistId).catch(
    () => [] as Awaited<ReturnType<typeof getTopRecordingsForArtist>>,
  );
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

  // Stream the LB listener stats — the album header paints with rg
  // data immediately; the listens / listeners number block fills in
  // via Suspense once LB returns. Same posture for the sidebar's
  // Top Listeners list. `release` (an MB call) is still awaited
  // synchronously since the streaming-services row in the header AND
  // the tracklist both need it.
  const listenersPromise = getReleaseGroupListeners(mbid).catch(() => null);
  const release = canonical
    ? await getRelease(canonical.id).catch(() => null)
    : null;

  // Merge url-rels from both the release group AND the canonical
  // release. MB editors often attach Spotify / Apple Music to a
  // specific release (edition) rather than the abstract release group,
  // so the rg-level rels alone routinely come up empty even for albums
  // that are widely streaming. `partitionArtistRelations` accepts
  // anything with a `relations?` field, so we can call it on either.
  const rgUrls = partitionArtistRelations(rg).urls;
  const releaseUrls = release
    ? partitionArtistRelations({ relations: release.relations }).urls
    : [];
  // Dedupe by URL — release-group and release editions sometimes
  // duplicate the same Spotify / Apple link.
  const urls = Array.from(
    new Map([...rgUrls, ...releaseUrls].map((l) => [l.url, l])).values(),
  );
  // Streaming services render as a favicon row above the tracklist;
  // everything else (Wikipedia, Discogs, lyrics, etc.) stays in the
  // sidebar's "Other Links" so we don't show Spotify/Apple twice.
  const { streaming: streamingUrls, other: otherUrlsFromMb } =
    categoriseLinks(urls);
  // Always link back to MusicBrainz so users who care about a specific
  // release / format / catalog number can drill in there. Append rather
  // than prepend so MB sits below editorially-added rels (Wikipedia
  // etc.) — those have richer info; MB is the dependable last stop.
  // Dedupe in case a future MB editor adds the entity's own URL as a
  // rel (rare but cheap to guard).
  const mbReleaseGroupUrl = `https://musicbrainz.org/release-group/${mbid}`;
  const otherUrls = otherUrlsFromMb.some((l) => l.url === mbReleaseGroupUrl)
    ? otherUrlsFromMb
    : [
        ...otherUrlsFromMb,
        { type: "musicbrainz entry", url: mbReleaseGroupUrl },
      ];

  const listenCounts = release
    ? await fetchListenCounts(release, credit.primaryArtistId).catch(
        () => new Map<string, number>(),
      )
    : new Map<string, number>();

  // Reviews are gated by per-user feature flags. We mount the
  // <AlbumReviews> client island unconditionally — it bypasses the
  // page-level edge cache by fetching `/api/release-group/[mbid]/reviews`
  // post-hydration, where the auth + flag checks happen. Doing the
  // flag check here would break the CDN cache split since the page
  // would render different HTML for allowlisted vs anonymous viewers.
  const parachordTracks: ParachordTrack[] | undefined = release
    ? release.media
        ?.flatMap((m) => m.tracks ?? [])
        .map((t): ParachordTrack => {
          const trackArtist =
            formatArtistCredit(t["artist-credit"]).name || credit.name;
          const lengthMs = t.length ?? t.recording?.length;
          return {
            title: t.title,
            artist: trackArtist,
            album: rg.title,
            ...(lengthMs ? { duration: Math.round(lengthMs / 1000) } : {}),
          };
        })
    : undefined;

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

  return (
    <>
      {breadcrumbs.length > 0 && (
        <div className="mt-8">
          <Breadcrumbs items={breadcrumbs} />
        </div>
      )}
      <AlbumHeader
        rg={rg}
        parachordTracks={parachordTracks}
        streamingLinks={streamingUrls}
        statsSlot={
          <Suspense fallback={<HeaderStatsSkeleton />}>
            <HeaderStats promise={listenersPromise} />
          </Suspense>
        }
      />

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-w-0 space-y-12">
          <section>
            <h2 className="mb-4 text-sm font-semibold tracking-wide uppercase">
              Tracks
            </h2>
            {release ? (
              <TrackList release={release} listenCounts={listenCounts} />
            ) : (
              <EmptyState
                title="No track listing"
                description="MusicBrainz doesn't have a release on file we can show tracks from."
              />
            )}
          </section>

          {/* Per-user reviews block. Renders nothing for viewers
              without the feature flag; otherwise streams in CB/
              Wikipedia content from the per-user API endpoint after
              hydration. See `components/achordion/album-reviews.tsx`. */}
          <AlbumReviews mbid={mbid} />
        </div>

        <aside className="space-y-8">
          <Suspense fallback={null}>
            <TopListenersStream promise={listenersPromise} />
          </Suspense>
          {otherUrls.length > 0 && (
            <div>
              {/* h2 (sidebar): sibling of the main column's "Tracks"
                  h2, not nested under it. (#10) */}
              <h2 className="mb-3 text-xs tracking-wide uppercase text-muted-foreground">
                Other Links
              </h2>
              <ExternalLinks links={otherUrls} />
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

/** Streams the listens / listeners line in the album header. */
async function HeaderStats({
  promise,
}: {
  promise: Promise<ReleaseGroupListeners | null>;
}) {
  const listeners = await promise;
  const totalListens = listeners?.total_listen_count;
  const totalListeners = listeners?.total_user_count;
  if (totalListens === undefined && totalListeners === undefined) return null;
  return (
    <p className="text-muted-foreground text-sm tabular-nums">
      {totalListens !== undefined && (
        <>
          <span className="text-foreground font-medium">
            {totalListens.toLocaleString()}
          </span>{" "}
          listens
        </>
      )}
      {totalListeners !== undefined && totalListens !== undefined && " · "}
      {totalListeners !== undefined && (
        <>
          <span className="text-foreground font-medium">
            {totalListeners.toLocaleString()}
          </span>{" "}
          listeners
        </>
      )}
    </p>
  );
}

function HeaderStatsSkeleton() {
  return <Skeleton className="h-4 w-44" />;
}

/** Streams the sidebar's Top Listeners list. Renders nothing when the
 *  album has no listener stats (LB endpoint 204/404'd). */
async function TopListenersStream({
  promise,
}: {
  promise: Promise<ReleaseGroupListeners | null>;
}) {
  const listeners = await promise;
  if (!listeners?.listeners || listeners.listeners.length === 0) return null;
  return (
    <div>
      {/* h2 (sidebar): sibling of the main column's "Tracks" h2. */}
      <h2 className="mb-3 text-xs tracking-wide uppercase text-muted-foreground">
        Top listeners
      </h2>
      <TopListenersList listeners={listeners.listeners} />
    </div>
  );
}

export default async function ReleaseGroupPage({ params }: PageParams) {
  const { mbid } = await params;
  return (
    <PageShell>
      <Suspense fallback={<AlbumPageSkeleton />}>
        <AlbumBody mbid={mbid} />
      </Suspense>
    </PageShell>
  );
}

/** Full-page skeleton during the initial `getReleaseGroup` wait.
 *  Mirrors the real layout — cover + title block, two-column body
 *  with tracklist on the left and sidebar on the right — so the
 *  user sees the page shape immediately rather than a blank canvas
 *  when MB is rate-limited. */
function AlbumPageSkeleton() {
  return (
    <div className="space-y-10 pt-8">
      {/* Header: cover + breadcrumb / title / artist / stats */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-8">
        <Skeleton className="aspect-square w-full max-w-[280px] rounded-md sm:max-w-none" />
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
