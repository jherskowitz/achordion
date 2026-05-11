import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  formatArtistCredit,
  getRelease,
  getReleaseGroup,
  partitionArtistRelations,
  pickCanonicalRelease,
  type ReleaseDetail,
} from "@/lib/clients/musicbrainz";
import { parachordPlayAlbum, type ParachordTrack } from "@/lib/parachord";
import {
  getReleaseGroupListeners,
  getTopRecordingsForArtist,
  type ReleaseGroupListeners,
} from "@/lib/clients/listenbrainz";
import { caaReleaseGroupUrl } from "@/lib/clients/coverart";
import { PageHeader } from "@/components/achordion/page-header";
import {
  EntityHeaderStats,
  EntityHeaderStatsSkeleton,
} from "@/components/achordion/entity-header-stats";
import { PageShell } from "@/components/achordion/page-shell";
import { CoverArt } from "@/components/achordion/cover-art";
import { PlayOnHoverFab } from "@/components/achordion/play-on-hover-fab";
import { TrackList } from "@/components/achordion/track-list";
import { TopListenersList } from "@/components/achordion/top-listeners-list";
import { auth } from "@/auth";
import { resolveBskyAvatarsForUsers } from "@/lib/bsky-display";
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
  // Pre-render the MB streaming url-rels (rg-level + release-level
  // merged) as clickable favicons on first paint, so a friend who
  // lands here from a Parachord-shared link can play immediately
  // even on a cold MBID. The <StreamingLinksRow> client island
  // upgrades this set with the full Odesli-enriched / cache-resolved
  // list once it mounts.
  const initialStreamingItems = streamingUrls
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
  const albumOdesliSeed = streamingUrls[0]?.url ?? null;
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

  // Genre / tag chips. Mirrors the recording page — capped at 8,
  // sorted by editor-vote count, used by TagChips for the inline
  // chip row below the header.
  const tagsSource = rg.genres?.length ? rg.genres : rg.tags ?? [];
  const tags = tagsSource
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
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
            <PlayOnHoverFab
              href={parachordPlayAlbum({
                ...(rg.id
                  ? { mbid: rg.id }
                  : {
                      artist: credit.name,
                      title: rg.title,
                      tracks: parachordTracks,
                    }),
              })}
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
            <TrackListActionsMenu
              title={`${rg.title} — ${credit.name}`}
              creator={credit.name}
              tracks={parachordTracks ?? []}
              triggerLabel={`${rg.title} actions`}
            />
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
          <Suspense fallback={<EntityHeaderStatsSkeleton />}>
            <HeaderStats promise={listenersPromise} />
          </Suspense>
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

/** Streams the album's listens / listeners into the shared
 *  EntityHeaderStats block — same visual treatment as the
 *  recording header. */
async function HeaderStats({
  promise,
}: {
  promise: Promise<ReleaseGroupListeners | null>;
}) {
  const listeners = await promise;
  return (
    <EntityHeaderStats
      totalListens={listeners?.total_listen_count}
      totalListeners={listeners?.total_user_count}
    />
  );
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
  // Upgrade DiceBear default avatars to each listener's linked
  // Bluesky avatar when available. `resolveBskyAvatarsForUsers`
  // returns an empty map when the viewer's flag is off, the user
  // hasn't linked, or Bluesky is unreachable — so this is a no-op
  // for unlinked rows, no fallback rendering required.
  const session = await auth();
  const viewer = session?.user?.mbUsername ?? null;
  const bskyAvatars = await resolveBskyAvatarsForUsers(
    viewer,
    listeners.listeners.map((l) => l.user_name),
  );
  return (
    <div>
      {/* h2 (sidebar): sibling of the main column's "Tracks" h2. */}
      <h2 className="mb-3 text-xs tracking-wide uppercase text-muted-foreground">
        Top listeners
      </h2>
      <TopListenersList
        listeners={listeners.listeners}
        bskyAvatars={bskyAvatars}
      />
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
