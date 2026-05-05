import Link from "next/link";
import { Suspense } from "react";
import {
  getCreatedForPlaylists,
  getRecommendedRecordings,
  getRecordingMetadata,
  getSimilarUsers,
  getUserFreshReleases,
  playlistMbidFromIdentifier,
  type FreshRelease,
  type LbPlaylistSummary,
  type LbRadioTrack,
} from "@/lib/clients/listenbrainz";
import { auth } from "@/auth";
import type { ParachordTrack } from "@/lib/parachord";
import { PageShell } from "@/components/achordion/page-shell";
import { PlaylistCard } from "@/components/achordion/playlist-card";
import { ComingSoon } from "@/components/achordion/coming-soon";
import { ExploreTrackList } from "@/components/achordion/explore-track-list";
import { FamiliaritySlider } from "@/components/achordion/familiarity-slider";
import { thresholdFromFamiliarity } from "@/lib/familiarity";
import {
  buildExcludedArtistSet,
  buildExcludedRecordingSet,
} from "@/lib/exclude-listened";
import { FreshReleasesGrid } from "@/components/achordion/fresh-releases-grid";
import { OpenInParachordButton } from "@/components/achordion/open-in-parachord-button";
import { RecommendedArtistsList } from "@/components/achordion/recommended-artists-list";
import { SimilarUsersList } from "@/components/achordion/similar-users-list";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getPlaylist } from "@/lib/clients/listenbrainz";

const JSPF_PLAYLIST_KEY = "https://musicbrainz.org/doc/jspf#playlist";

function algoOf(p: LbPlaylistSummary): string | null {
  return (
    p.playlist.extension?.[JSPF_PLAYLIST_KEY]?.additional_metadata
      ?.algorithm_metadata?.source_patch ?? null
  );
}

function dateOf(p: LbPlaylistSummary): number {
  const ext = p.playlist.extension?.[JSPF_PLAYLIST_KEY];
  const iso = ext?.last_modified_at ?? p.playlist.date;
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

async function CardWithCovers({ entry }: { entry: LbPlaylistSummary }) {
  const mbid = playlistMbidFromIdentifier(entry.playlist.identifier);
  let tracks: LbRadioTrack[] = [];
  if (mbid) {
    const detail = await getPlaylist(mbid).catch(() => null);
    if (detail) tracks = detail.tracks;
  }
  return <PlaylistCard entry={entry} tracks={tracks} />;
}

function TwoCardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {Array.from({ length: 2 }).map((_, i) => (
        <div
          key={i}
          className="border-border/60 flex gap-3 rounded-xl border px-4 py-3"
        >
          <Skeleton className="size-16 shrink-0 rounded-md" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function TrackListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ol className="border-border/60 divide-border/60 divide-y rounded-xl border px-4">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 py-3">
          <Skeleton className="size-4" />
          <Skeleton className="size-10 rounded-md" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </li>
      ))}
    </ol>
  );
}

function GridSkeleton({ cols = 4, rows = 8 }: { cols?: number; rows?: number }) {
  const gridClass =
    cols === 4
      ? "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
      : "grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3";
  return (
    <div className={gridClass}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="border-border/60 space-y-2 rounded-xl border p-4"
        >
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/** Trailing-7-days window — releases that have *already come out* in
 *  the past week. The previous behavior (forward-looking ISO week)
 *  surfaced albums announced for later in the week, which read like
 *  upcoming-release teasers rather than "go listen now." Showing
 *  already-released albums in the trailing 7-day window matches what
 *  most users mean by "what's new this week." */
function pastWeekRange(now = new Date()): { startIso: string; endIso: string } {
  const utc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const end = new Date(utc);
  // `endIso` is the day after today so the comparison `< endIso`
  // includes everything released today (release_date is YYYY-MM-DD).
  end.setUTCDate(end.getUTCDate() + 1);
  const start = new Date(utc);
  start.setUTCDate(start.getUTCDate() - 7);
  return {
    startIso: start.toISOString().slice(0, 10),
    endIso: end.toISOString().slice(0, 10),
  };
}

function inPastWeek(r: FreshRelease, range: { startIso: string; endIso: string }) {
  return r.release_date >= range.startIso && r.release_date < range.endIso;
}

function isStudioRelease(r: FreshRelease): boolean {
  // Match the default "studio" filter on /explore/fresh-releases — Albums + EPs.
  const primary = r.release_group_primary_type;
  return primary === "Album" || primary === "EP";
}

async function ThisWeekReleasesSection({ username }: { username: string }) {
  // Past-only — already-released albums in the trailing 7-day window.
  // Pad the fetch to 10 days back to absorb any timezone drift between
  // our local "today" and LB's release_date precision.
  const releases = await getUserFreshReleases(username, {
    days: 10,
    past: true,
    future: false,
    sort: "release_date",
  }).catch(() => [] as FreshRelease[]);
  const range = pastWeekRange();
  const thisWeek = releases.filter(
    (r) => inPastWeek(r, range) && isStudioRelease(r),
  );
  if (thisWeek.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No new releases from your artists in the last 7 days — check back
        soon, or see all{" "}
        <Link
          href="/explore/fresh-releases"
          className="hover:text-foreground underline-offset-4 hover:underline"
        >
          fresh releases
        </Link>
        .
      </p>
    );
  }
  return <FreshReleasesGrid releases={thisWeek} />;
}

function FreshReleaseSkeleton({ cols = 5 }: { cols?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {Array.from({ length: cols * 2 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="aspect-square w-full rounded-md" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

async function WeeklyAlgoSection({
  username,
  algorithm,
  emptyMessage,
}: {
  username: string;
  algorithm: "weekly-jams" | "weekly-exploration";
  emptyMessage: string;
}) {
  const page = await getCreatedForPlaylists(username, 50).catch(() => null);
  if (!page) {
    return (
      <p className="text-muted-foreground text-sm">{emptyMessage}</p>
    );
  }
  const matches = page.playlists
    .filter((p) => algoOf(p) === algorithm)
    .sort((a, b) => dateOf(b) - dateOf(a))
    .slice(0, 2);
  if (matches.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">{emptyMessage}</p>
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {matches.map((entry) => (
        <li key={entry.playlist.identifier}>
          <Suspense
            fallback={
              <div className="border-border/60 flex gap-3 rounded-xl border px-4 py-3">
                <Skeleton className="size-16 shrink-0 rounded-md" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            }
          >
            <CardWithCovers entry={entry} />
          </Suspense>
        </li>
      ))}
    </ul>
  );
}

/**
 * Resolve the same filtered top-12 recommendation set used by the
 * tracks rail and its Play-all button. Both call sites invoke this;
 * the underlying LB fetches share Next's data cache so the second
 * call is a free dedup, not a real round-trip.
 */
async function loadRecommendedTracks(username: string, familiarity: number) {
  const threshold = thresholdFromFamiliarity(familiarity);
  // Filter by track (recording) play count, not artist play count —
  // a familiar artist can still have a deep cut you've never heard,
  // and we want to surface those. Pull a wider raw set when the
  // slider asks for more discoveries so the visible 12 stays full.
  const rawCount = threshold === null ? 25 : 100;
  const [recordings, exclude] = await Promise.all([
    getRecommendedRecordings(username, rawCount, "raw").catch(() => []),
    buildExcludedRecordingSet(username, threshold),
  ]);
  if (recordings.length === 0) {
    return { top: [], metadata: new Map(), parachordTracks: [] };
  }
  const metadata = await getRecordingMetadata(
    recordings.map((r) => r.recording_mbid),
  );
  // Hide anything LB knows the user has heard, at any non-zero
  // slider value. `latest_listened_at` is the only reliable signal
  // for "I've heard this exact recommendation" — MBID-based filters
  // miss cases where the rec and the user's listen history use
  // different MBIDs for the same conceptual track. The
  // listen-count `exclude` set is kept as belt-and-braces for the
  // graduated-strictness UX.
  const filtered = recordings.filter((r) => {
    if (familiarity === 0) return true;
    if (r.latest_listened_at !== null) return false;
    if (exclude.has(r.recording_mbid)) return false;
    return true;
  });
  const top = filtered.slice(0, 12);
  const parachordTracks: ParachordTrack[] = top
    .map((r) => {
      const m = metadata.get(r.recording_mbid);
      const title = m?.recording?.name;
      const artist = m?.artist?.name;
      if (!title || !artist) return null;
      const length = m?.recording?.length;
      return {
        title,
        artist,
        ...(m?.release?.name ? { album: m.release.name } : {}),
        ...(length ? { duration: Math.round(length / 1000) } : {}),
      } as ParachordTrack;
    })
    .filter((t): t is ParachordTrack => t !== null);
  return { top, metadata, parachordTracks };
}

async function RecommendedTracksSection({
  username,
  familiarity,
}: {
  username: string;
  familiarity: number;
}) {
  const { top, metadata } = await loadRecommendedTracks(username, familiarity);
  if (top.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Listen for a few weeks and ListenBrainz will start surfacing
        recommendations here.
      </p>
    );
  }
  return <ExploreTrackList recordings={top} metadata={metadata} />;
}

/** Sits next to the Filters trigger on the Recommended-tracks row. */
async function RecommendedTracksPlayAll({
  username,
  familiarity,
}: {
  username: string;
  familiarity: number;
}) {
  const { parachordTracks } = await loadRecommendedTracks(
    username,
    familiarity,
  );
  if (parachordTracks.length === 0) return null;
  return (
    <OpenInParachordButton
      kind="playlist"
      tracks={parachordTracks}
      label="Play all"
    />
  );
}

async function RecommendedArtistsSection({
  username,
  familiarity,
}: {
  username: string;
  familiarity: number;
}) {
  const threshold = thresholdFromFamiliarity(familiarity);
  // Fetch recommendations + build the exclude set in parallel. The
  // exclude set is "every artist whose all-time listen_count exceeds
  // the slider's threshold" — captures artists outside the top-100
  // who the user nonetheless plays regularly.
  const [recordings, exclude] = await Promise.all([
    getRecommendedRecordings(username, 100, "raw").catch(() => []),
    buildExcludedArtistSet(username, threshold),
  ]);
  if (recordings.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Listen for a few weeks and ListenBrainz will start surfacing
        recommendations here.
      </p>
    );
  }
  const metadata = await getRecordingMetadata(
    recordings.map((r) => r.recording_mbid),
  );
  return (
    <RecommendedArtistsList
      recordings={recordings}
      metadata={metadata}
      limit={12}
      excludeMbids={exclude}
    />
  );
}

async function SimilarUsersSection({
  username,
  limit = 12,
  layout = "grid",
}: {
  username: string;
  limit?: number;
  layout?: "grid" | "stack";
}) {
  const users = await getSimilarUsers(username, limit).catch(() => []);
  return <SimilarUsersList users={users} layout={layout} />;
}

function parseFamiliarity(raw: string | undefined): number {
  if (!raw) return 50;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, n));
}

export default async function ExploreOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{
    artistsFamiliarity?: string;
    tracksFamiliarity?: string;
  }>;
}) {
  const sp = await searchParams;
  const artistsFamiliarity = parseFamiliarity(sp.artistsFamiliarity);
  const tracksFamiliarity = parseFamiliarity(sp.tracksFamiliarity);
  const session = await auth();
  const username = session?.user?.mbUsername ?? null;

  if (!username) {
    return (
      <PageShell className="pt-8">
        <ComingSoon
          title="Sign in to explore"
          description="Personalized weekly playlists, recommendations, and similar listeners need a ListenBrainz identity. Sign in with MusicBrainz to see them."
          hint={
            <Button size="sm" nativeButton={false} render={<Link href="/login" />}>
              Continue with MusicBrainz
            </Button>
          }
        />
      </PageShell>
    );
  }

  return (
    <PageShell className="pt-8">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-12">
          <section>
            <SectionHeader
              title="New this week"
              hint="Albums released in the last 7 days, from artists you listen to."
              seeAllHref="/explore/fresh-releases"
            />
            <Suspense fallback={<FreshReleaseSkeleton />}>
              <ThisWeekReleasesSection username={username} />
            </Suspense>
          </section>

          <section>
            <SectionHeader
              title="Weekly Jams"
              hint="Tracks ListenBrainz thinks you'll dig."
              seeAllHref="/explore/weekly-jams"
            />
            <Suspense fallback={<TwoCardSkeleton />}>
              <WeeklyAlgoSection
                username={username}
                algorithm="weekly-jams"
                emptyMessage="No Weekly Jams playlist yet."
              />
            </Suspense>
          </section>

          <section>
            <SectionHeader
              title="Weekly Explorations"
              hint="Stuff outside your usual orbit."
              seeAllHref="/explore/weekly-exploration"
            />
            <Suspense fallback={<TwoCardSkeleton />}>
              <WeeklyAlgoSection
                username={username}
                algorithm="weekly-exploration"
                emptyMessage="No Weekly Exploration playlist yet."
              />
            </Suspense>
          </section>

          <section>
            <SectionHeader
              title="Recommended artists"
              seeAllHref="/explore/recommended-artists"
            />
            <div className="mb-3">
              <FamiliaritySlider
                initial={artistsFamiliarity}
                param="artistsFamiliarity"
              />
            </div>
            {/* Key the Suspense on the threshold (not the slider value)
                so within-bucket nudges don't trigger pointless skeleton
                flashes — same threshold = same data, no need to refetch. */}
            <Suspense
              key={`artists-${thresholdFromFamiliarity(artistsFamiliarity) ?? "off"}`}
              fallback={<GridSkeleton cols={4} rows={8} />}
            >
              <RecommendedArtistsSection
                username={username}
                familiarity={artistsFamiliarity}
              />
            </Suspense>
          </section>

          <section>
            <SectionHeader
              title="Recommended tracks"
              seeAllHref="/explore/recommended-tracks"
            />
            <div className="mb-3 flex items-start justify-between gap-3">
              <FamiliaritySlider
                initial={tracksFamiliarity}
                param="tracksFamiliarity"
                kind="track"
              />
              <Suspense
                key={`tracks-pa-${thresholdFromFamiliarity(tracksFamiliarity) ?? "off"}`}
                fallback={null}
              >
                <RecommendedTracksPlayAll
                  username={username}
                  familiarity={tracksFamiliarity}
                />
              </Suspense>
            </div>
            <Suspense
              key={`tracks-${thresholdFromFamiliarity(tracksFamiliarity) ?? "off"}`}
              fallback={<TrackListSkeleton rows={8} />}
            >
              <RecommendedTracksSection
                username={username}
                familiarity={tracksFamiliarity}
              />
            </Suspense>
          </section>
        </div>

        <aside className="space-y-3">
          <SectionHeader
            title="Similar listeners"
            seeAllHref="/explore/similar-users"
          />
          <Suspense fallback={<SidebarUserSkeleton rows={8} />}>
            <SimilarUsersSection
              username={username}
              limit={10}
              layout="stack"
            />
          </Suspense>
        </aside>
      </div>
    </PageShell>
  );
}

function SectionHeader({
  title,
  hint,
  seeAllHref,
}: {
  title: string;
  hint?: string;
  seeAllHref?: string;
}) {
  return (
    <header className="mb-4 flex items-baseline justify-between gap-3">
      <h2 className="text-sm font-semibold tracking-wide uppercase">
        {title}
      </h2>
      <div className="flex items-baseline gap-3">
        {hint && (
          <p className="text-muted-foreground/70 hidden text-xs sm:block">
            {hint}
          </p>
        )}
        {seeAllHref && (
          <Link
            href={seeAllHref}
            className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
          >
            See all →
          </Link>
        )}
      </div>
    </header>
  );
}

function SidebarUserSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <ul className="space-y-1.5">
      {Array.from({ length: rows }).map((_, i) => (
        <li
          key={i}
          className="border-border/60 flex items-center gap-3 rounded-md border px-2 py-1.5"
        >
          <Skeleton className="size-7 rounded-full" />
          <Skeleton className="h-3.5 w-24" />
        </li>
      ))}
    </ul>
  );
}
