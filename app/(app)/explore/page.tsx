import Link from "next/link";
import { Suspense } from "react";
import {
  getCreatedForPlaylists,
  getRecommendedRecordings,
  getRecordingMetadata,
  getSimilarUsers,
  playlistMbidFromIdentifier,
  type LbPlaylistSummary,
  type LbRadioTrack,
} from "@/lib/clients/listenbrainz";
import { auth } from "@/auth";
import { PageShell } from "@/components/achordion/page-shell";
import { PlaylistCard } from "@/components/achordion/playlist-card";
import { ComingSoon } from "@/components/achordion/coming-soon";
import { ExploreTrackList } from "@/components/achordion/explore-track-list";
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
    <div className="grid gap-3 md:grid-cols-2">
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
    <ul className="grid gap-3 md:grid-cols-2">
      {matches.map((entry, i) => (
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
          <p className="text-muted-foreground/70 mt-1 px-1 text-[11px] tracking-wide uppercase">
            {i === 0 ? "This week" : "Last week"}
          </p>
        </li>
      ))}
    </ul>
  );
}

async function RecommendationsSection({
  username,
  variant,
}: {
  username: string;
  variant: "tracks" | "artists";
}) {
  const recordings = await getRecommendedRecordings(username, 25, "raw").catch(
    () => [],
  );
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
  if (variant === "tracks") {
    return (
      <ExploreTrackList
        recordings={recordings.slice(0, 12)}
        metadata={metadata}
      />
    );
  }
  return (
    <RecommendedArtistsList
      recordings={recordings}
      metadata={metadata}
      limit={12}
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

export default async function ExploreOverviewPage() {
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
      <div className="grid gap-10 lg:grid-cols-[1fr_280px]">
        <div className="min-w-0 space-y-12">
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
            <Suspense fallback={<GridSkeleton cols={4} rows={8} />}>
              <RecommendationsSection
                username={username}
                variant="artists"
              />
            </Suspense>
          </section>

          <section>
            <SectionHeader
              title="Recommended tracks"
              seeAllHref="/explore/recommended-tracks"
            />
            <Suspense fallback={<TrackListSkeleton rows={8} />}>
              <RecommendationsSection username={username} variant="tracks" />
            </Suspense>
          </section>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
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
