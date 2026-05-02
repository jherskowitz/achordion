import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, ExternalLink, Users } from "lucide-react";
import { getPlaylist } from "@/lib/clients/listenbrainz";
import { caaReleaseUrl } from "@/lib/clients/coverart";
import { parachordPlayTrack, type ParachordTrack } from "@/lib/parachord";
import { PageShell } from "@/components/achordion/page-shell";
import { CoverArt } from "@/components/achordion/cover-art";
import { OpenInParachordButton } from "@/components/achordion/open-in-parachord-button";
import { PlayOverNumberCell } from "@/components/achordion/parachord-button";
import { PlaylistCoverMosaic } from "@/components/achordion/playlist-cover-mosaic";
import { Skeleton } from "@/components/ui/skeleton";

interface PageProps {
  params: Promise<{ mbid: string }>;
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatLength(ms: number | null): string {
  if (!ms || ms <= 0) return "—";
  const totalSec = Math.round(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function algorithmLabel(source: string): string {
  return source
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

async function PlaylistBody({ mbid }: { mbid: string }) {
  const data = await getPlaylist(mbid);
  if (!data) notFound();

  const dateStr = formatDate(data.date);
  const totalDurationMs = data.tracks.reduce(
    (sum, t) => sum + (t.durationMs ?? 0),
    0,
  );
  const totalMinutes = Math.round(totalDurationMs / 60000);
  const parachordTracks: ParachordTrack[] = data.tracks.map((t) => ({
    title: t.title,
    artist: t.artistName,
    ...(t.releaseName ? { album: t.releaseName } : {}),
    ...(t.durationMs ? { duration: Math.round(t.durationMs / 1000) } : {}),
  }));

  return (
    <>
      <header className="mt-8 mb-10 grid gap-6 sm:grid-cols-[200px_1fr] sm:gap-8">
        <PlaylistCoverMosaic
          tracks={data.tracks}
          alt={data.title}
          className="aspect-square w-full max-w-[280px] sm:max-w-none"
        />
        <div className="flex min-w-0 flex-col justify-end">
          <p className="text-muted-foreground text-xs tracking-wide uppercase">
            Playlist
            {data.algorithmSource && (
              <>
                <span className="mx-1.5">·</span>
                {algorithmLabel(data.algorithmSource)}
              </>
            )}
            {!data.isPublic && <span className="mx-1.5">· Private</span>}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl md:text-5xl">
            {data.title}
          </h1>
          <p className="text-muted-foreground mt-3 text-base">
            {data.creator && (
              <>
                by{" "}
                <Link
                  href={`/user/${encodeURIComponent(data.creator)}`}
                  className="hover:text-foreground hover:underline underline-offset-4"
                >
                  {data.creator}
                </Link>
              </>
            )}
            {dateStr && (
              <>
                {data.creator && <span> · </span>}
                {dateStr}
              </>
            )}
          </p>
          {data.collaborators.length > 0 && (
            <p className="text-muted-foreground/80 mt-1 inline-flex items-center gap-1 text-xs">
              <Users className="size-3" />
              with {data.collaborators.join(", ")}
            </p>
          )}
          {data.tracks.length > 0 && (
            <p className="text-muted-foreground mt-2 text-sm tabular-nums">
              <span className="text-foreground font-medium">
                {data.tracks.length}
              </span>{" "}
              tracks
              {totalMinutes > 0 && (
                <>
                  {" "}
                  ·{" "}
                  <span className="text-foreground font-medium">
                    {totalMinutes}
                  </span>{" "}
                  min
                </>
              )}
            </p>
          )}
          {data.annotation && (
            <p className="text-muted-foreground/80 mt-3 max-w-prose text-sm leading-6">
              {data.annotation}
            </p>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {data.tracks.length > 0 && (
              <OpenInParachordButton
                tracks={parachordTracks}
                fallback={{
                  title: data.title,
                  creator: data.creator ?? "ListenBrainz",
                }}
              />
            )}
            {data.externalUrls?.spotify && (
              <a
                href={data.externalUrls.spotify}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs underline-offset-4 hover:underline"
              >
                Open on Spotify
                <ExternalLink className="size-3" />
              </a>
            )}
            {data.tracks.length > 0 && (
              <a
                href={`/api/playlist/${mbid}/xspf`}
                download
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs underline-offset-4 hover:underline"
              >
                <Download className="size-3" />
                Download XSPF
              </a>
            )}
            <a
              href={`https://listenbrainz.org/playlist/${mbid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs underline-offset-4 hover:underline"
            >
              Open on ListenBrainz
              <ExternalLink className="size-3" />
            </a>
          </div>
        </div>
      </header>

      {data.tracks.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          This playlist has no tracks.
        </p>
      ) : (
        <ol className="border-border/60 rounded-xl border px-4">
          {data.tracks.map((t, i) => {
            const cover =
              t.caaReleaseMbid && t.caaId
                ? `https://archive.org/download/mbid-${t.caaReleaseMbid}/mbid-${t.caaReleaseMbid}-${t.caaId}_thumb250.jpg`
                : t.releaseMbid
                  ? caaReleaseUrl(t.releaseMbid, 250)
                  : null;
            return (
              <li
                key={`${t.recordingMbid ?? t.title}-${i}`}
                className="border-border/60 group flex items-center gap-3 border-b py-2.5 last:border-b-0"
              >
                <PlayOverNumberCell
                  number={i + 1}
                  href={parachordPlayTrack({
                    artist: t.artistName,
                    title: t.title,
                  })}
                  className="w-7"
                />
                <CoverArt
                  src={cover}
                  alt={t.releaseName ?? t.title}
                  size={40}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {t.recordingMbid ? (
                      <Link
                        href={`/recording/${t.recordingMbid}`}
                        className="hover:underline"
                      >
                        {t.title}
                      </Link>
                    ) : (
                      t.title
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
                        <span className="opacity-50"> · </span>
                        {t.releaseMbid ? (
                          <Link
                            href={`/release/${t.releaseMbid}/album`}
                            className="hover:text-foreground italic"
                          >
                            {t.releaseName}
                          </Link>
                        ) : (
                          <em>{t.releaseName}</em>
                        )}
                      </>
                    )}
                  </p>
                </div>
                <span className="text-muted-foreground shrink-0 tabular-nums text-xs">
                  {formatLength(t.durationMs)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}

function HeaderSkeleton() {
  return (
    <div className="mt-8 mb-10 grid gap-6 sm:grid-cols-[200px_1fr] sm:gap-8">
      <Skeleton className="aspect-square w-full max-w-[280px] rounded-md sm:max-w-none" />
      <div className="space-y-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-24" />
      </div>
    </div>
  );
}

export default async function PlaylistPage({ params }: PageProps) {
  const { mbid } = await params;
  return (
    <PageShell>
      <Suspense fallback={<HeaderSkeleton />}>
        <PlaylistBody mbid={mbid} />
      </Suspense>
    </PageShell>
  );
}

