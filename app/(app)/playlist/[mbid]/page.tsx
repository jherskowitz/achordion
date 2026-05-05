import { Suspense } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ExternalLink, Globe, Lock, Users } from "lucide-react";
import { auth } from "@/auth";
import { getLbTokenForRequest } from "@/lib/lb-token";
import { getPlaylist } from "@/lib/clients/listenbrainz";
import { caaReleaseUrl } from "@/lib/clients/coverart";
import { parachordPlayTrack, type ParachordTrack } from "@/lib/parachord";
import {
  artistHref,
  recordingHref,
  releaseGroupHref,
} from "@/lib/entity-links";
import { stripHtml } from "@/lib/strip-html";
import { safeHttpUrl } from "@/components/achordion/external-links";
import { PageShell } from "@/components/achordion/page-shell";
import { Breadcrumbs } from "@/components/achordion/breadcrumbs";
import { CoverArt } from "@/components/achordion/cover-art";
import { OpenInParachordButton } from "@/components/achordion/open-in-parachord-button";
import { PlayOverNumberCell } from "@/components/achordion/parachord-button";
import { PlaylistCoverMosaic } from "@/components/achordion/playlist-cover-mosaic";
import { PlaylistOwnerToolsMenu } from "@/components/achordion/playlist-owner-tools-menu";
import { TrackListActionsMenu } from "@/components/achordion/track-list-actions-menu";
import { PlaylistVisibilityToggle } from "@/components/achordion/playlist-visibility-toggle";
import { TrackActionsMenuSlot } from "@/components/achordion/track-actions-menu-slot";
import { IconTooltip } from "@/components/ui/icon-tooltip";
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

/**
 * Build a public absolute URL for a request-relative path. Reads the
 * forwarded host/proto from the incoming request so deployments behind
 * proxies (Vercel, Cloudflare, etc.) get the right origin. Returns
 * `null` when the request resolves to loopback/private — Parachord's
 * SSRF guard would reject those URLs anyway, so we'd rather fall back
 * to inline tracks than send a URL that fails on the other side.
 */
async function publicUrl(path: string): Promise<string | null> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return null;
  const lower = host.toLowerCase();
  if (
    lower === "localhost" ||
    lower.startsWith("localhost:") ||
    lower.startsWith("127.") ||
    lower.startsWith("0.0.0.0") ||
    lower.startsWith("[::1]")
  ) {
    return null;
  }
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}${path}`;
}

async function PlaylistBody({ mbid }: { mbid: string }) {
  // Hit the unauthed (cached) endpoint first — it covers every
  // public playlist, which is the overwhelming majority. Only fall
  // back to the per-viewer authed lookup when the cached call comes
  // back null AND the viewer has a token; that's the only path that
  // can resolve a private playlist owned by the viewer.
  const [session, token] = await Promise.all([
    auth(),
    getLbTokenForRequest(),
  ]);
  let data = await getPlaylist(mbid);
  if (!data && token) {
    data = await getPlaylist(mbid, token).catch(() => null);
  }
  if (!data) notFound();
  const xspfUrl = await publicUrl(`/api/playlist/${mbid}/xspf`);
  const viewer = session?.user?.mbUsername ?? null;
  const isOwner =
    !!viewer &&
    !!data.creator &&
    viewer.toLowerCase() === data.creator.toLowerCase();

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

  // Breadcrumb trail: User › Playlists › <title>. Hide entirely
  // when the playlist has no creator on file (rare — algorithmic /
  // anonymous playlists), since the trail would dead-end.
  const breadcrumbs = data.creator
    ? [
        {
          label: data.creator,
          href: `/user/${encodeURIComponent(data.creator)}`,
        },
        {
          label: "Playlists",
          href: `/user/${encodeURIComponent(data.creator)}/playlists`,
        },
        { label: data.title },
      ]
    : [];

  return (
    <>
      {breadcrumbs.length > 0 && (
        <div className="mt-8">
          <Breadcrumbs items={breadcrumbs} />
        </div>
      )}
      <header className="mt-8 mb-10 grid grid-cols-1 gap-6 sm:grid-cols-[240px_minmax(0,1fr)] sm:gap-8">
        <PlaylistCoverMosaic
          tracks={data.tracks}
          alt={data.title}
          className="aspect-square w-full max-w-[320px] sm:max-w-none"
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
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {data.tracks.length > 0 && (
              <p className="text-muted-foreground text-sm tabular-nums">
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
            {isOwner ? (
              <PlaylistVisibilityToggle
                mbid={mbid}
                initialIsPublic={data.isPublic}
              />
            ) : (
              <IconTooltip
                label={
                  data.isPublic
                    ? "Public — visible to anyone with the link."
                    : "Private — only the owner can see this."
                }
              >
                <span className="text-muted-foreground border-border/60 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] tracking-wide uppercase">
                  {data.isPublic ? (
                    <Globe className="size-3" />
                  ) : (
                    <Lock className="size-3" />
                  )}
                  {data.isPublic ? "Public" : "Private"}
                </span>
              </IconTooltip>
            )}
          </div>
          {data.annotation && stripHtml(data.annotation) && (
            <p className="text-muted-foreground/80 mt-3 max-w-prose text-sm leading-6">
              {stripHtml(data.annotation)}
            </p>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {data.tracks.length > 0 && (
              // Hand Parachord the public XSPF URL when one is available
              // (production deploy with a real host) so it can fetch the
              // canonical playlist content. Falls back to inline tracks
              // when running locally or behind loopback.
              <OpenInParachordButton
                kind="playlist"
                tracks={parachordTracks}
                url={xspfUrl ?? undefined}
                title={data.title}
                creator={data.creator ?? "ListenBrainz"}
              />
            )}
            {data.tracks.length > 0 &&
              (isOwner ? (
                <PlaylistOwnerToolsMenu
                  mbid={mbid}
                  owner={data.creator}
                  initial={{
                    title: data.title,
                    annotation: data.annotation ?? "",
                    isPublic: data.isPublic,
                    collaborators: data.collaborators,
                  }}
                  tracks={parachordTracks}
                  xspfUrl={`/api/playlist/${mbid}/xspf`}
                  xspfFilename={(data.title || mbid)
                    .replace(/[^\w\d\-]+/g, "_")
                    .replace(/^_+|_+$/g, "")
                    .slice(0, 80) || mbid}
                />
              ) : (
                <TrackListActionsMenu
                  title={data.title}
                  creator={data.creator ?? undefined}
                  tracks={parachordTracks}
                  xspfUrl={`/api/playlist/${mbid}/xspf`}
                  xspfFilename={(data.title || mbid)
                    .replace(/[^\w\d\-]+/g, "_")
                    .replace(/^_+|_+$/g, "")
                    .slice(0, 80) || mbid}
                  triggerLabel="Playlist actions"
                />
              ))}
            {(() => {
              const spotifyHref = safeHttpUrl(data.externalUrls?.spotify);
              if (!spotifyHref) return null;
              return (
                <a
                  href={spotifyHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs underline-offset-4 hover:underline"
                >
                  Open on Spotify
                  <ExternalLink className="size-3" />
                </a>
              );
            })()}
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
                    <Link
                      href={recordingHref({
                        mbid: t.recordingMbid,
                        artist: t.artistName,
                        title: t.title,
                      })}
                      className="hover:underline"
                    >
                      {t.title}
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
                        <span className="opacity-50"> · </span>
                        {/* Release-MBID points at a specific edition.
                            Without it, lookup at the release-group
                            level since that's our canonical album page. */}
                        {t.releaseMbid ? (
                          <Link
                            href={`/release/${t.releaseMbid}/album`}
                            className="hover:text-foreground italic"
                          >
                            {t.releaseName}
                          </Link>
                        ) : (
                          <Link
                            href={releaseGroupHref({
                              artist: t.artistName,
                              title: t.releaseName,
                            })}
                            className="hover:text-foreground italic"
                          >
                            {t.releaseName}
                          </Link>
                        )}
                      </>
                    )}
                  </p>
                </div>
                <span className="text-muted-foreground shrink-0 tabular-nums text-xs">
                  {formatLength(t.durationMs)}
                </span>
                <TrackActionsMenuSlot
                  track={{
                    recordingMbid: t.recordingMbid,
                    trackName: t.title,
                    artistName: t.artistName,
                    releaseMbid: t.releaseMbid,
                  }}
                />
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
    <div className="mt-8 mb-10 grid grid-cols-1 gap-6 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-8">
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

