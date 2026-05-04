import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Play } from "lucide-react";
import { getSpinbinPlaylist } from "@/lib/clients/spinbin";
import { getSpinbinStation } from "@/lib/spinbin-stations";
import { parachordPlayTrack } from "@/lib/parachord";
import {
  artistHref,
  recordingHref,
  releaseGroupHref,
} from "@/lib/entity-links";
import { LazyTrackCover } from "@/components/achordion/lazy-track-cover";
import { OpenInParachordButton } from "@/components/achordion/open-in-parachord-button";
import { PageShell } from "@/components/achordion/page-shell";

// User asked for "refreshes on each load" — opt every render of this
// route into dynamic mode, even with future caching changes upstream.
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ station: string }>;
}

function tileTextColor(hex: string): string {
  const m = hex.match(/^#?([a-f0-9]{6})$/i);
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62
    ? "#111111"
    : "#ffffff";
}

function formatRefreshed(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function generateMetadata({ params }: PageProps) {
  const { station: id } = await params;
  const station = getSpinbinStation(id);
  return { title: station ? `${station.name} Rewind` : "Radio Rewind" };
}

export default async function RewindStationPage({ params }: PageProps) {
  const { station: id } = await params;
  const station = getSpinbinStation(id);
  if (!station) notFound();

  const playlist = await getSpinbinPlaylist(station.xspfUrl);
  const fg = tileTextColor(station.color);
  const refreshed = formatRefreshed(playlist?.date ?? null);
  const tracks = playlist?.tracks ?? [];

  // Hand Parachord the public XSPF URL when available so it can refill /
  // refresh from the source instead of a one-shot inline list.
  const parachordTracks = tracks.map((t) => ({
    title: t.title,
    artist: t.creator,
    ...(t.album ? { album: t.album } : {}),
  }));

  return (
    <PageShell className="pt-8">
      <div className="mb-6">
        <Link
          href="/radio"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm underline-offset-4 hover:underline"
        >
          <ArrowLeft className="size-3.5" />
          Back to Radio
        </Link>
      </div>

      <header className="mb-8 grid gap-6 sm:grid-cols-[200px_1fr] sm:items-end sm:gap-8">
        <div
          className="flex aspect-square w-full max-w-[280px] items-center justify-center rounded-2xl text-center font-semibold tracking-tight sm:max-w-none"
          style={{ backgroundColor: station.color, color: fg }}
          aria-hidden
        >
          <span className="px-4 text-2xl leading-tight">{station.name}</span>
        </div>
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs tracking-wide uppercase">
            Radio Rewind
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
            {station.name} Rewind
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">{station.meta}</p>
          <p className="text-muted-foreground/80 mt-3 max-w-prose text-sm leading-6">
            {station.blurb}
          </p>
          <p className="text-muted-foreground/70 mt-3 text-xs">
            {tracks.length} track{tracks.length === 1 ? "" : "s"}
            {refreshed && (
              <>
                <span className="mx-1.5">·</span>
                Source refreshed {refreshed}
              </>
            )}
            <span className="mx-1.5">·</span>
            <a
              href={station.infoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground inline-flex items-center gap-1 underline-offset-4 hover:underline"
            >
              {new URL(station.infoUrl).hostname.replace(/^www\./, "")}
              <ExternalLink className="size-3" />
            </a>
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {tracks.length > 0 && (
              <OpenInParachordButton
                kind="playlist"
                title={`${station.name} Rewind`}
                tracks={parachordTracks}
                url={station.xspfUrl}
              />
            )}
            <a
              href={station.xspfUrl}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline"
            >
              Download XSPF
              <ExternalLink className="size-3" />
            </a>
          </div>
        </div>
      </header>

      {playlist === null ? (
        <p className="text-muted-foreground text-sm">
          Couldn&apos;t reach the spinbin feed. The daily generator may be
          mid-run, or this station may be on hiatus. Try again in a minute.
        </p>
      ) : tracks.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No tracks in today&apos;s feed yet — check back after the next
          5am ET refresh.
        </p>
      ) : (
        <ol className="border-border/60 divide-border/60 divide-y rounded-xl border px-4">
          {tracks.map((t, i) => {
            return (
              <li
                key={`${t.title}-${i}`}
                className="group flex items-center gap-3 py-3"
              >
                <span className="text-muted-foreground w-6 shrink-0 text-xs tabular-nums">
                  {i + 1}
                </span>
                <a
                  href={parachordPlayTrack({
                    artist: t.creator,
                    title: t.title,
                  })}
                  aria-label={`Play "${t.title}" by ${t.creator} in Parachord`}
                  title="Play in Parachord"
                  className="group/cover relative shrink-0 overflow-hidden rounded-md"
                >
                  {/* Lazy CAA lookup when spinbin didn't include a
                      cover URL on its feed. Page paints instantly
                      with placeholders; covers stream in over the
                      next several seconds as MB / CAA round-trips
                      complete. Cached server-side so subsequent
                      visits are fast. */}
                  <LazyTrackCover
                    artist={t.creator}
                    title={t.title}
                    album={t.album}
                    alt={t.album ?? t.title}
                    size={40}
                    initialSrc={t.image}
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
                    {/* No MBIDs from the spinbin feed — recordingHref
                        falls through to /recording/lookup which
                        resolves canonically server-side. */}
                    <Link
                      href={recordingHref({
                        artist: t.creator,
                        title: t.title,
                      })}
                      className="hover:underline"
                    >
                      {t.title}
                    </Link>
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    <Link
                      href={artistHref({ name: t.creator })}
                      className="hover:text-foreground"
                    >
                      {t.creator}
                    </Link>
                    {t.album && (
                      <>
                        <span className="mx-1.5 opacity-50">·</span>
                        <Link
                          href={releaseGroupHref({
                            artist: t.creator,
                            title: t.album,
                          })}
                          className="hover:text-foreground italic"
                        >
                          {t.album}
                        </Link>
                      </>
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </PageShell>
  );
}
