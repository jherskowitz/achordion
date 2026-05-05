import Link from "next/link";
import { Suspense } from "react";
import { Play } from "lucide-react";
import {
  getRecordingMetadata,
  getUserFeedback,
  type FeedbackItem,
} from "@/lib/clients/listenbrainz";
import { caaReleaseUrl } from "@/lib/clients/coverart";
import { parachordPlayTrack } from "@/lib/parachord";
import { feedbackToParachordTracks } from "@/lib/parachord-listens";
import { ComingSoon } from "@/components/achordion/coming-soon";
import { CoverArt } from "@/components/achordion/cover-art";
import { PageShell } from "@/components/achordion/page-shell";
import { TrackListActionsMenu } from "@/components/achordion/track-list-actions-menu";
import { OpenInParachordButton } from "@/components/achordion/open-in-parachord-button";
import { TrackActionsMenuSlot } from "@/components/achordion/track-actions-menu-slot";
import {
  artistHref,
  recordingHref,
  releaseGroupHref,
} from "@/lib/entity-links";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Loves" };

interface PageParams {
  params: Promise<{ name: string }>;
}

function relativeTimestamp(unix: number): string {
  const d = new Date(unix * 1000);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface LovedTrack {
  trackName: string;
  artistName: string;
  recordingMbid: string | null;
  artistMbid: string | null;
  releaseName: string | null;
  releaseMbid: string | null;
  /**
   * Cover URL — preferred archive.org direct URL when LB gave us
   * caa_id+caa_release_mbid, otherwise fall back to caaReleaseUrl
   * which 302s to the right size.
   */
  cover: string | null;
  lovedAt: number;
}

function pickCoverUrl(
  caaReleaseMbid: string | undefined,
  caaId: number | string | undefined,
  releaseMbid: string | undefined,
): string | null {
  if (caaReleaseMbid && caaId) {
    return `https://archive.org/download/mbid-${caaReleaseMbid}/mbid-${caaReleaseMbid}-${caaId}_thumb250.jpg`;
  }
  if (releaseMbid) return caaReleaseUrl(releaseMbid, 250);
  return null;
}

async function LovesBody({ name }: { name: string }) {
  const feedback = await getUserFeedback(name, { score: 1, count: 50 });
  if (feedback.length === 0) {
    return (
      <ComingSoon
        title={`${name} hasn't loved any tracks yet`}
        description="Loves on ListenBrainz appear here — anything they've ❤️'d on a track shows up in this list."
      />
    );
  }

  // Loves before LB's MB-mapping work only carry recording_msid (no
  // mbid) — those won't enrich. Filter to MBID-bearing entries before
  // hitting the metadata endpoint, then merge any text-only rows back
  // in afterwards so the user still sees them in date order.
  const mbidLoves = feedback.filter(
    (f): f is FeedbackItem & { recording_mbid: string } =>
      typeof f.recording_mbid === "string" && f.recording_mbid.length > 0,
  );
  const enriched = await getRecordingMetadata(
    mbidLoves.map((f) => f.recording_mbid),
  );

  const tracks: LovedTrack[] = feedback.flatMap((f) => {
    const meta = f.recording_mbid
      ? enriched.get(f.recording_mbid)
      : undefined;
    const trackName =
      meta?.recording?.name ?? f.track_metadata?.track_name ?? null;
    const artistName =
      meta?.artist?.name ??
      meta?.artist?.artists?.[0]?.name ??
      f.track_metadata?.artist_name ??
      null;
    if (!trackName || !artistName) return [];
    const cover = pickCoverUrl(
      meta?.release?.caa_release_mbid ??
        f.track_metadata?.mbid_mapping?.caa_release_mbid ??
        undefined,
      meta?.release?.caa_id ??
        f.track_metadata?.mbid_mapping?.caa_id ??
        undefined,
      meta?.release?.mbid ??
        f.track_metadata?.mbid_mapping?.release_mbid ??
        f.track_metadata?.additional_info?.release_mbid ??
        undefined,
    );
    return [
      {
        trackName,
        artistName,
        recordingMbid: f.recording_mbid ?? null,
        artistMbid: meta?.artist?.artists?.[0]?.artist_mbid ?? null,
        releaseName:
          meta?.release?.name ?? f.track_metadata?.release_name ?? null,
        releaseMbid: meta?.release?.mbid ?? null,
        cover,
        lovedAt: f.created,
      },
    ];
  });

  return (
    <>
      <p className="text-muted-foreground mb-4 text-xs">
        {feedback.length.toLocaleString()} loved track
        {feedback.length === 1 ? "" : "s"} · most recent first
      </p>
      <ol className="border-border/60 divide-border/60 divide-y rounded-xl border px-4">
        {tracks.map((t, i) => {
          const playHref = parachordPlayTrack({
            artist: t.artistName,
            title: t.trackName,
          });
          return (
            <li
              key={`${t.recordingMbid ?? t.trackName}-${i}`}
              className="group flex items-center gap-3 py-3"
            >
              <a
                href={playHref}
                aria-label={`Play "${t.trackName}" by ${t.artistName} in Parachord`}
                title="Play in Parachord"
                className="group/cover relative shrink-0 overflow-hidden rounded-md"
              >
                <CoverArt
                  src={t.cover}
                  alt={t.releaseName ?? t.trackName}
                  size={40}
                />
                <span
                  aria-hidden
                  className="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 transition-opacity group-hover/cover:opacity-100"
                >
                  <Play className="size-4 fill-white text-white" />
                </span>
              </a>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  <Link
                    href={recordingHref({
                      mbid: t.recordingMbid,
                      artist: t.artistName,
                      title: t.trackName,
                    })}
                    className="hover:underline"
                  >
                    {t.trackName}
                  </Link>
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  <Link
                    href={artistHref({
                      mbid: t.artistMbid,
                      name: t.artistName,
                    })}
                    className="hover:text-foreground"
                  >
                    {t.artistName}
                  </Link>
                  {t.releaseName && (
                    <>
                      <span className="mx-1.5 opacity-50">·</span>
                      {t.releaseMbid ? (
                        <Link
                          href={`/release/${t.releaseMbid}`}
                          className="italic hover:text-foreground"
                        >
                          {t.releaseName}
                        </Link>
                      ) : (
                        <Link
                          href={releaseGroupHref({
                            artist: t.artistName,
                            title: t.releaseName,
                          })}
                          className="italic hover:text-foreground"
                        >
                          {t.releaseName}
                        </Link>
                      )}
                    </>
                  )}
                </p>
              </div>
              <time
                dateTime={new Date(t.lovedAt * 1000).toISOString()}
                className="text-muted-foreground/70 shrink-0 tabular-nums text-xs"
                title={new Date(t.lovedAt * 1000).toLocaleString()}
              >
                {relativeTimestamp(t.lovedAt)}
              </time>
              <TrackActionsMenuSlot
                track={{
                  recordingMbid: t.recordingMbid,
                  trackName: t.trackName,
                  artistName: t.artistName,
                  releaseMbid: t.releaseMbid,
                }}
              />
            </li>
          );
        })}
      </ol>
    </>
  );
}

function LovesSkeleton() {
  return (
    <ol className="border-border/60 divide-border/60 divide-y rounded-xl border px-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 py-3">
          <Skeleton className="size-10 shrink-0 rounded-md" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-3 w-16" />
        </li>
      ))}
    </ol>
  );
}

async function LovesCta({ name }: { name: string }) {
  let tracks: ReturnType<typeof feedbackToParachordTracks> = [];
  try {
    const feedback = await getUserFeedback(name, { score: 1, count: 500 });
    tracks = feedbackToParachordTracks(feedback);
  } catch {
    // Both buttons still render; their actions just no-op when empty.
  }
  return (
    <div className="flex items-center gap-2">
      <OpenInParachordButton
        kind="playlist"
        tracks={tracks}
        title={`${name} — Loved tracks`}
        creator={name}
      />
      <TrackListActionsMenu
        title={`${name} — Loved tracks`}
        creator={name}
        tracks={tracks}
        xspfUrl={`/api/user/${encodeURIComponent(name)}/loved.xspf`}
        xspfFilename={`${name}-loved`}
        triggerLabel="Loved-tracks actions"
      />
    </div>
  );
}

export default async function LovesPage({ params }: PageParams) {
  const { name } = await params;
  return (
    <PageShell className="pt-8">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-wide uppercase">
            Loves
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Tracks {name} has loved on ListenBrainz.
          </p>
        </div>
        <Suspense fallback={null}>
          <LovesCta name={name} />
        </Suspense>
      </header>
      <Suspense fallback={<LovesSkeleton />}>
        <LovesBody name={name} />
      </Suspense>
    </PageShell>
  );
}
