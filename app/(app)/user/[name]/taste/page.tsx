import Link from "next/link";
import { Suspense } from "react";
import { Heart } from "lucide-react";
import {
  getRecordingMetadata,
  getUserFeedback,
  type FeedbackItem,
} from "@/lib/clients/listenbrainz";
import { ComingSoon } from "@/components/achordion/coming-soon";
import { PageShell } from "@/components/achordion/page-shell";
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
  lovedAt: number;
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
    return [
      {
        trackName,
        artistName,
        recordingMbid: f.recording_mbid ?? null,
        artistMbid: meta?.artist?.artists?.[0]?.artist_mbid ?? null,
        releaseName:
          meta?.release?.name ?? f.track_metadata?.release_name ?? null,
        releaseMbid: meta?.release?.mbid ?? null,
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
        {tracks.map((t, i) => (
          <li
            key={`${t.recordingMbid ?? t.trackName}-${i}`}
            className="flex items-center gap-3 py-3"
          >
            <Heart className="size-4 shrink-0 fill-rose-500 text-rose-500" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {t.recordingMbid ? (
                  <Link
                    href={`/recording/${t.recordingMbid}`}
                    className="hover:underline"
                  >
                    {t.trackName}
                  </Link>
                ) : (
                  t.trackName
                )}
              </p>
              <p className="text-muted-foreground truncate text-xs">
                {t.artistMbid ? (
                  <Link
                    href={`/artist/${t.artistMbid}`}
                    className="hover:text-foreground"
                  >
                    {t.artistName}
                  </Link>
                ) : (
                  t.artistName
                )}
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
                      <span className="italic">{t.releaseName}</span>
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
          </li>
        ))}
      </ol>
    </>
  );
}

function LovesSkeleton() {
  return (
    <ol className="border-border/60 divide-border/60 divide-y rounded-xl border px-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 py-3">
          <Skeleton className="size-4 shrink-0 rounded" />
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

export default async function LovesPage({ params }: PageParams) {
  const { name } = await params;
  return (
    <PageShell className="pt-8">
      <header className="mb-6">
        <h2 className="text-sm font-semibold tracking-wide uppercase">
          Loves
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Tracks {name} has loved on ListenBrainz.
        </p>
      </header>
      <Suspense fallback={<LovesSkeleton />}>
        <LovesBody name={name} />
      </Suspense>
    </PageShell>
  );
}
