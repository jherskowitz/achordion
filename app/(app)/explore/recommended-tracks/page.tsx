import { Suspense } from "react";
import Link from "next/link";
import { auth } from "@/auth";
import {
  getRecommendedRecordings,
  getRecordingMetadata,
} from "@/lib/clients/listenbrainz";
import { buildExcludedRecordingSet } from "@/lib/exclude-listened";
import { thresholdFromFamiliarity } from "@/lib/familiarity";
import type { ParachordTrack } from "@/lib/parachord";
import { ExploreTrackList } from "@/components/achordion/explore-track-list";
import { FamiliaritySlider } from "@/components/achordion/familiarity-slider";
import { OpenInParachordButton } from "@/components/achordion/open-in-parachord-button";
import { TrackListActionsMenu } from "@/components/achordion/track-list-actions-menu";
import { PageShell } from "@/components/achordion/page-shell";
import { EmptyState } from "@/components/achordion/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Recommended tracks" };

interface PageProps {
  searchParams: Promise<{ familiarity?: string }>;
}

function parseFamiliarity(raw: string | undefined): number {
  if (!raw) return 50;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, n));
}

/** Shared loader so the list and the Play-all share filter logic.
 *  Both call sites trigger the same LB fetches; Next's data cache
 *  dedupes them within a single render. */
async function loadFilteredTracks(username: string, familiarity: number) {
  const threshold = thresholdFromFamiliarity(familiarity);
  const [recordings, exclude] = await Promise.all([
    getRecommendedRecordings(username, 200, "raw").catch(() => []),
    buildExcludedRecordingSet(username, threshold),
  ]);
  if (recordings.length === 0) {
    return { top: [], metadata: new Map(), parachordTracks: [] };
  }
  const metadata = await getRecordingMetadata(
    recordings.map((r) => r.recording_mbid),
  );
  // Hide anything LB knows the user has heard, at any non-zero
  // slider value. See overview page for the full reasoning.
  const filtered = recordings.filter((r) => {
    if (familiarity === 0) return true;
    if (r.latest_listened_at !== null) return false;
    if (exclude.has(r.recording_mbid)) return false;
    return true;
  });
  const top = filtered.slice(0, 50);
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

async function Body({
  username,
  familiarity,
}: {
  username: string;
  familiarity: number;
}) {
  const { top, metadata } = await loadFilteredTracks(username, familiarity);
  if (top.length === 0) {
    return (
      <EmptyState
        title="No recommendations yet"
        description="Listen for a few weeks and ListenBrainz will surface picks here."
      />
    );
  }
  return <ExploreTrackList recordings={top} metadata={metadata} />;
}

async function PlayAll({
  username,
  familiarity,
}: {
  username: string;
  familiarity: number;
}) {
  const { parachordTracks } = await loadFilteredTracks(username, familiarity);
  if (parachordTracks.length === 0) return null;
  const title = `${username} — Recommended tracks`;
  return (
    <div className="flex items-center gap-2">
      <OpenInParachordButton
        kind="playlist"
        tracks={parachordTracks}
        title={title}
        creator={username}
        label="Play all"
      />
      <TrackListActionsMenu
        title={title}
        creator={username}
        tracks={parachordTracks}
        triggerLabel="Recommended-tracks actions"
      />
    </div>
  );
}

function Fallback() {
  return (
    <ol className="border-border/60 divide-border/60 divide-y rounded-xl border px-4">
      {Array.from({ length: 12 }).map((_, i) => (
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

export default async function RecommendedTracksPage({
  searchParams,
}: PageProps) {
  const sp = await searchParams;
  const familiarity = parseFamiliarity(sp.familiarity);
  const session = await auth();
  const username = session?.user?.mbUsername ?? null;

  if (!username) {
    return (
      <PageShell className="pt-8">
        <EmptyState
          title="Sign in for recommended tracks"
          description="LB's collaborative-filter model picks tracks based on listeners with overlapping taste."
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
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        Recommended tracks
      </h1>
      <div className="mb-3 flex items-start justify-between gap-3">
        <FamiliaritySlider
          initial={familiarity}
          param="familiarity"
          kind="track"
        />
        <Suspense
          key={`pa-${thresholdFromFamiliarity(familiarity) ?? "off"}`}
          fallback={null}
        >
          <PlayAll username={username} familiarity={familiarity} />
        </Suspense>
      </div>
      <Suspense
        key={`${thresholdFromFamiliarity(familiarity) ?? "off"}`}
        fallback={<Fallback />}
      >
        <Body username={username} familiarity={familiarity} />
      </Suspense>
    </PageShell>
  );
}
