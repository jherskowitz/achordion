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
import { EmptyState } from "@/components/achordion/empty-state";
import { ExploreTrackList } from "@/components/achordion/explore-track-list";
import { FamiliaritySlider } from "@/components/achordion/familiarity-slider";
import { filterByRecency } from "@/lib/familiarity";
import { buildExcludedArtistSet } from "@/lib/exclude-listened";
import { FreshReleasesGrid } from "@/components/achordion/fresh-releases-grid";
import { OpenInParachordButton } from "@/components/achordion/open-in-parachord-button";
import { RecommendedArtistsList } from "@/components/achordion/recommended-artists-list";
import { SimilarUsersList } from "@/components/achordion/similar-users-list";
import { resolveBskyAvatarsForUsers } from "@/lib/bsky-display";
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
  // LB's `future: false` flag is meant to filter out unreleased
  // entries, but in practice some still leak through (entries with
  // release_date past the server's "today" by hours / a day). Apply
  // a hard local guard: only items whose release_date is on or
  // before today survive. Belt-and-suspenders alongside the `inPastWeek`
  // bound which already excludes anything past `endIso` (tomorrow).
  const todayIso = new Date().toISOString().slice(0, 10);
  const thisWeek = releases.filter(
    (r) =>
      r.release_date <= todayIso &&
      inPastWeek(r, range) &&
      isStudioRelease(r),
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
  // Overview's "New this week" header already frames the time
  // range — `hideWeekHeaders` suppresses redundant per-bucket
  // sub-labels ("Last week") on items that fall on the prior
  // Monday-anchored boundary.
  return <FreshReleasesGrid releases={thisWeek} hideWeekHeaders />;
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
  // Pull the full rec pool in one LB call. Like the dedicated
  // /explore/recommended-tracks page, the discovery tracks
  // (latest_listened_at === null) live deep in the score-sorted list
  // — the first never-heard rec routinely sits past index ~90 — so a
  // small raw count starves the discovery end of the slider, often
  // down to a single row. LB returns the whole set (~1000) regardless
  // of `count`, so 1000 surfaces them all at no extra LB cost.
  //
  // Catch so a 429 from LB doesn't take the entire /explore page down
  // — an empty pool degrades the row gracefully.
  const recordings = await getRecommendedRecordings(
    username,
    1000,
    "raw",
  ).catch(() => []);
  if (recordings.length === 0) {
    return { top: [], metadata: new Map(), parachordTracks: [] };
  }
  // Graduate by recency of listening (see lib/familiarity.ts): 0 keeps
  // all, 100 keeps only never-heard, between hides the most-recently-
  // heard share. Reliable where a recording-MBID play-count match
  // isn't, and one fewer LB call. Filter BEFORE resolving metadata so
  // the per-track lookup is only paid for the handful we might show.
  const filtered = filterByRecency(recordings, familiarity);
  // Overscan past the visible 12 so the occasional rec whose LB
  // metadata lookup comes back empty (niche / freshly-uploaded MBID)
  // can be dropped without leaving a gap — while still resolving far
  // fewer than the full pool.
  const candidates = filtered.slice(0, 24);
  const metadata = await getRecordingMetadata(
    candidates.map((r) => r.recording_mbid),
  ).catch(() => new Map<string, never>());
  // Drop rows whose metadata didn't resolve — they'd render as
  // "Unknown track" placeholders, which read as broken even though
  // the recommendation itself is valid.
  const top = candidates
    .filter((r) => {
      const m = metadata.get(r.recording_mbid);
      return !!m?.recording?.name && !!m?.artist?.name;
    })
    .slice(0, 12);
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
  layout = "grid",
}: {
  username: string;
  familiarity: number;
  layout?: "grid" | "stack";
}) {
  // Fetch recommendations + build the exclude set in parallel. The
  // exclude set is the user's top `familiarity`% most-played artists
  // (play-rank percentile), so the slider graduates evenly across its
  // range instead of saturating for heavy listeners.
  const [recordings, exclude] = await Promise.all([
    getRecommendedRecordings(username, 100, "raw").catch(() => []),
    buildExcludedArtistSet(username, familiarity).catch(
      () => new Set<string>(),
    ),
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
  ).catch(() => new Map<string, never>());
  return (
    <RecommendedArtistsList
      recordings={recordings}
      metadata={metadata}
      limit={layout === "stack" ? 10 : 12}
      excludeMbids={exclude}
      layout={layout}
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
  const bskyAvatars = await resolveBskyAvatarsForUsers(
    username,
    users.map((u) => u.user_name),
  );
  return (
    <SimilarUsersList
      users={users}
      layout={layout}
      bskyAvatars={bskyAvatars}
    />
  );
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
        <EmptyState
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
                key={`tracks-pa-${tracksFamiliarity}`}
                fallback={null}
              >
                <RecommendedTracksPlayAll
                  username={username}
                  familiarity={tracksFamiliarity}
                />
              </Suspense>
            </div>
            <Suspense
              key={`tracks-${tracksFamiliarity}`}
              fallback={<TrackListSkeleton rows={8} />}
            >
              <RecommendedTracksSection
                username={username}
                familiarity={tracksFamiliarity}
              />
            </Suspense>
          </section>
        </div>

        <aside className="space-y-8">
          {/* Recommended artists lives in the sidebar (not the main
              column) so the page balances visually — main column was
              all-grids, sidebar was just the similar-listeners list.
              Stack layout = single-column compact rows that fit the
              280px sidebar without horizontal squeeze. */}
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
            <Suspense
              key={`artists-${artistsFamiliarity}`}
              fallback={<SidebarUserSkeleton rows={8} />}
            >
              <RecommendedArtistsSection
                username={username}
                familiarity={artistsFamiliarity}
                layout="stack"
              />
            </Suspense>
          </section>

          <section>
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
          </section>
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
