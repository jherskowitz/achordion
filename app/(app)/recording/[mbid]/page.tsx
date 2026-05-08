import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  dedupeReleaseGroups,
  formatArtistCredit,
  getRecording,
  partitionArtistRelations,
  type RecordingRelease,
} from "@/lib/clients/musicbrainz";
import {
  getRecordingPopularity,
  getReleaseGroupListeners,
  type ReleaseGroupListeners,
} from "@/lib/clients/listenbrainz";
import { caaReleaseUrl } from "@/lib/clients/coverart";
import { parachordPlayAlbum, parachordPlayTrack } from "@/lib/parachord";
import { CoverArt } from "@/components/achordion/cover-art";
import { PlayOnHoverFab } from "@/components/achordion/play-on-hover-fab";
import { TrackActionsMenuSlot } from "@/components/achordion/track-actions-menu-slot";
import { ReleaseTypeChip } from "@/components/achordion/release-type-chip";
import {
  ExternalLinks,
  categoriseLinks,
  normalizeStreamingUrl,
  tooltipLabel,
} from "@/components/achordion/external-links";
import { StreamingLinksRow } from "@/components/achordion/streaming-links-row";
import { PageHeader } from "@/components/achordion/page-header";
import {
  EntityHeaderStats,
  EntityHeaderStatsSkeleton,
} from "@/components/achordion/entity-header-stats";
import { PageShell } from "@/components/achordion/page-shell";
import { TopListenersList } from "@/components/achordion/top-listeners-list";
import { EmbedShareButton } from "@/components/achordion/embed-share-button";
import { TagChips } from "@/components/achordion/tag-chips";
import { Skeleton } from "@/components/ui/skeleton";

interface PageProps {
  params: Promise<{ mbid: string }>;
}

function formatLength(ms: number | null | undefined): string | null {
  if (!ms || ms <= 0) return null;
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Pick the recording's hero release: official + earliest, falling back. */
function pickHeroRelease(
  releases: RecordingRelease[] | undefined,
): RecordingRelease | null {
  if (!releases || releases.length === 0) return null;
  const official = releases.filter((r) => r.status === "Official");
  const pool = official.length > 0 ? official : releases;
  return pool
    .slice()
    .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"))[0];
}

async function RecordingBody({ mbid }: { mbid: string }) {
  let recording;
  try {
    recording = await getRecording(mbid);
  } catch {
    notFound();
  }

  const credit = formatArtistCredit(recording["artist-credit"]);
  const heroRelease = pickHeroRelease(recording.releases);
  const heroReleaseGroup = heroRelease?.["release-group"] ?? null;
  const otherReleaseGroups = dedupeReleaseGroups(recording.releases).filter(
    (r) => r["release-group"]?.id !== heroReleaseGroup?.id,
  );
  const length = formatLength(recording.length);
  // Stream the LB calls — recording popularity (header stats block)
  // and the hero album's listeners (sidebar Top Listeners). LB has
  // no per-recording top-listeners endpoint, so the hero album's
  // listeners is the closest proxy. Don't await here — hand the
  // promises to Suspense'd children so the header + breadcrumb +
  // "Also appears on" grid can paint immediately on getRecording's
  // return.
  const popularityPromise = getRecordingPopularity(mbid).catch(() => null);
  const albumListenersPromise: Promise<ReleaseGroupListeners | null> =
    heroReleaseGroup
      ? getReleaseGroupListeners(heroReleaseGroup.id).catch(() => null)
      : Promise.resolve(null);
  const cover = heroRelease ? caaReleaseUrl(heroRelease.id, 500) : null;
  const { urls } = partitionArtistRelations({
    relations: recording.relations,
  });
  // Use the first MB streaming url-rel (Spotify / Apple / etc.) as
  // the seed for the cross-service lookup. Sidebar "Other Links" gets
  // everything that isn't a streaming service so we don't double-show
  // Spotify both there and in the favicon row. The full MB streaming
  // list is pre-rendered as the favicon row's initial paint (see
  // `<StreamingLinksRow>` below) and the client island enriches it
  // with cache-resolved / Odesli-discovered platforms after mount —
  // dedupe-by-canonical-host on the row side keeps Spotify et al.
  // from rendering twice when both MB and Odesli have it.
  const { streaming: streamingUrls, other: otherUrls } = categoriseLinks(urls);
  const odesliSeed = streamingUrls[0]?.url ?? null;
  // Pre-render the MB streaming url-rels as clickable favicons on
  // first paint, so a friend who lands here from a Parachord-shared
  // link can play immediately even on a cold MBID. The
  // <StreamingLinksRow> client island upgrades this set with the
  // full Odesli-enriched / cache-resolved list once it mounts.
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
  const tags = (recording.genres?.length
    ? recording.genres
    : recording.tags ?? []
  )
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const releaseDate = recording["first-release-date"]?.slice(0, 4) ?? null;

  return (
    <>
      <PageHeader
        leading={
          // Cover-art tile with the standard hover play fab — same
          // treatment as every album grid, so playback is consistent.
          // Replaces the dedicated "Play in Parachord" CTA pill that
          // used to sit below the byline.
          <div className="group relative aspect-square w-32 overflow-hidden rounded-md sm:w-40">
            <CoverArt
              src={cover}
              alt={recording.title}
              size={500}
              className="aspect-square w-full transition-opacity group-hover:opacity-90"
              rounded="md"
            />
            <PlayOnHoverFab
              href={parachordPlayTrack({
                artist: credit.name,
                title: recording.title,
              })}
              label={`Play "${recording.title}" by ${credit.name} in Parachord`}
            />
          </div>
        }
        eyebrow="Track"
        title={recording.title}
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
            {heroReleaseGroup && (
              <>
                <span className="text-muted-foreground/70">·</span>
                <Link
                  href={`/release-group/${heroReleaseGroup.id}`}
                  className="text-muted-foreground hover:text-foreground italic underline-offset-4 hover:underline"
                >
                  {heroReleaseGroup.title}
                </Link>
              </>
            )}
            {releaseDate && (
              <>
                <span className="text-muted-foreground/70">·</span>
                <span className="text-muted-foreground tabular-nums">
                  {releaseDate}
                </span>
              </>
            )}
            {length && (
              <>
                <span className="text-muted-foreground/70">·</span>
                <span className="text-muted-foreground tabular-nums">
                  {length}
                </span>
              </>
            )}
            {recording.disambiguation && (
              <>
                <span className="text-muted-foreground/70">·</span>
                <em className="text-muted-foreground">
                  {recording.disambiguation}
                </em>
              </>
            )}
          </span>
        }
        breadcrumbs={[
          // Artist → Album → Track. Use the primary credited artist
          // (formatArtistCredit's first part) so guest features don't
          // pollute the trail. Album crumb is the hero release group
          // we already picked for the cover/title.
          ...(credit.parts[0]
            ? [
                {
                  label: credit.parts[0].name,
                  ...(credit.parts[0].id
                    ? { href: `/artist/${credit.parts[0].id}` }
                    : {}),
                },
              ]
            : []),
          ...(heroReleaseGroup
            ? [
                {
                  label: heroReleaseGroup.title,
                  href: `/release-group/${heroReleaseGroup.id}`,
                },
              ]
            : []),
          { label: recording.title },
        ]}
        afterTitle={
          // External streaming favicon row sits directly under the
          // artist · album · year · length byline, with the per-track
          // ⋮ menu inline at the start so it lives in the same row as
          // the external links rather than over in the actions slot.
          // <StreamingLinksRow> renders the MB url-rels we already
          // have on first paint (clickable immediately for a friend
          // landing on a shared link), then upgrades to the full
          // cache-resolved / Odesli-enriched set client-side.
          <div className="flex flex-wrap items-center gap-2">
            <TrackActionsMenuSlot
              track={{
                recordingMbid: recording.id,
                trackName: recording.title,
                artistName: credit.name,
                releaseMbid: heroRelease?.id ?? null,
              }}
            />
            <StreamingLinksRow
              entity="recording"
              mbid={recording.id}
              initialItems={initialStreamingItems}
              seedUrl={odesliSeed}
            />
            <EmbedShareButton entity="track" mbid={recording.id} />
          </div>
        }
        actions={
          <Suspense fallback={<EntityHeaderStatsSkeleton />}>
            <RecordingHeaderStats promise={popularityPromise} />
          </Suspense>
        }
      />

      <div className="-mt-2 flex flex-wrap gap-1.5 pb-4">
        <TagChips entity="recording" mbid={recording.id} initialTags={tags} />
      </div>

      {/* Two-column layout for the body: main column carries
          "Also appears on", sidebar shrinks to just Other Links.
          Top Listeners moved BELOW the grid so it spans the full
          page width — cards layout fills 3-up nicely at lg, but
          gets crowded inside the constrained main column. */}
      <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-w-0 space-y-12">
          {otherReleaseGroups.length > 0 && (
            <section>
              <h2 className="mb-4 text-sm font-semibold tracking-wide uppercase">
                Also appears on
              </h2>
              <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-5 xl:grid-cols-6">
                {otherReleaseGroups.map((r) => {
                  const rg = r["release-group"];
                  if (!rg) return null;
                  return (
                    <li key={rg.id} className="min-w-0">
                      <div className="group relative overflow-hidden rounded-md">
                        <Link
                          href={`/release-group/${rg.id}`}
                          className="block"
                        >
                          <CoverArt
                            src={caaReleaseUrl(r.id, 250)}
                            alt={rg.title}
                            size={250}
                            className="aspect-square w-full transition-opacity group-hover:opacity-90"
                            rounded="md"
                          />
                        </Link>
                        {/* "Also appears on" intermingles compilations,
                            albums, EPs — the chip lets users tell
                            formats apart at a glance. Renders nothing
                            for non-Album/EP types. */}
                        <ReleaseTypeChip type={rg["primary-type"]} />
                        <PlayOnHoverFab
                          href={parachordPlayAlbum({ mbid: rg.id })}
                          label={`Play "${rg.title}" in Parachord`}
                        />
                      </div>
                      <p className="mt-1.5 truncate text-xs font-medium">
                        <Link
                          href={`/release-group/${rg.id}`}
                          className="hover:underline"
                        >
                          {rg.title}
                        </Link>
                      </p>
                      {r.date && (
                        <p className="text-muted-foreground/70 text-[11px] tabular-nums">
                          {r.date.slice(0, 4)}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
        <aside className="space-y-8">
          {otherUrls.length > 0 && (
            <div>
              {/* h2 (not h3): sibling of the main column's content
                  h2s, not nested under any of them. (#10) */}
              <h2 className="mb-3 text-xs tracking-wide uppercase text-muted-foreground">
                Other Links
              </h2>
              <ExternalLinks links={otherUrls} />
            </div>
          )}
        </aside>
      </div>

      {/* Top Listeners — full page width below the two-column grid.
          Sourced from the hero album's listeners (LB has no per-
          recording listeners endpoint). Cards layout breathes 3-up
          at lg, falling back to 2 / 1 at sm / xs. mt-12 matches
          the inner space-y-12 cadence the rest of the page uses
          between sibling sections. */}
      <div className="mt-12">
        <Suspense fallback={null}>
          <AlbumTopListenersStream
            promise={albumListenersPromise}
            layout="cards"
          />
        </Suspense>
      </div>
    </>
  );
}

/** Streams the recording's listens / listeners into the shared
 *  EntityHeaderStats block — same visual treatment as the album
 *  header. */
async function RecordingHeaderStats({
  promise,
}: {
  promise: Promise<{ totalListenCount: number; totalUserCount: number } | null>;
}) {
  const popularity = await promise;
  if (!popularity) return null;
  return (
    <EntityHeaderStats
      totalListens={popularity.totalListenCount}
      totalListeners={popularity.totalUserCount}
    />
  );
}

/** Streams the Top Listeners section (sourced from the hero
 *  album's listeners — LB has no per-recording listeners endpoint).
 *  `layout="cards"` renders multi-column cards in the main column;
 *  `layout="stack"` (default) renders a compact sidebar list. */
async function AlbumTopListenersStream({
  promise,
  layout = "stack",
}: {
  promise: Promise<ReleaseGroupListeners | null>;
  layout?: "stack" | "cards";
}) {
  const listeners = await promise;
  if (!listeners?.listeners || listeners.listeners.length === 0) return null;
  return (
    <section>
      <h2
        className={
          layout === "cards"
            ? "mb-4 text-sm font-semibold tracking-wide uppercase"
            : "mb-3 text-xs tracking-wide uppercase text-muted-foreground"
        }
      >
        Top listeners
      </h2>
      <TopListenersList listeners={listeners.listeners} layout={layout} />
    </section>
  );
}

function RecordingPageSkeleton() {
  return (
    <div className="space-y-10 pt-8">
      <div className="flex items-start gap-5">
        <Skeleton className="aspect-square w-32 shrink-0 rounded-md sm:w-40" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-9 w-72 max-w-full" />
          <Skeleton className="h-4 w-64" />
          <div className="flex flex-wrap gap-1.5 pt-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-16 rounded-full" />
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-w-0">
          <Skeleton className="mb-4 h-3 w-32" />
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="aspect-square w-full rounded-md" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ))}
          </div>
        </div>
        <aside className="space-y-6">
          {Array.from({ length: 2 }).map((_, i) => (
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

export async function generateMetadata({ params }: PageProps) {
  const { mbid } = await params;
  try {
    const r = await getRecording(mbid);
    const credit = formatArtistCredit(r["artist-credit"]);
    return {
      title: credit.name ? `${r.title} — ${credit.name}` : r.title,
    };
  } catch {
    return { title: "Track" };
  }
}

export default async function RecordingPage({ params }: PageProps) {
  const { mbid } = await params;
  return (
    <PageShell>
      <Suspense fallback={<RecordingPageSkeleton />}>
        <RecordingBody mbid={mbid} />
      </Suspense>
    </PageShell>
  );
}
