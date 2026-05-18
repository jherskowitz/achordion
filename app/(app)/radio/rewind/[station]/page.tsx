import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { getSpinbinPlaylist } from "@/lib/clients/spinbin";
import { getSpinbinStation } from "@/lib/spinbin-stations";
import { tileTextColor } from "@/lib/spinbin-tile";
import { stationLogoUrl } from "@/lib/spinbin-logo";
import { OpenInParachordButton } from "@/components/achordion/open-in-parachord-button";
import { PageShell } from "@/components/achordion/page-shell";
import { RadioRewindRow } from "@/components/achordion/radio-rewind-row";
import { StationCover } from "@/components/achordion/station-cover";
import { TrackListActionsMenu } from "@/components/achordion/track-list-actions-menu";

// User asked for "refreshes on each load" — opt every render of this
// route into dynamic mode, even with future caching changes upstream.
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ station: string }>;
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

      <header className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-[200px_minmax(0,1fr)] sm:items-end sm:gap-8">
        <StationCover
          name={station.name}
          color={station.color}
          textColor={fg}
          // Prefer the playlist-level <image> Spinbin emits in the
          // XSPF; fall back to the predictable logos/<id>.svg URL for
          // older feeds that pre-date the playlist <image> rollout.
          // <StationCover> swaps to the brand-colour tile if both
          // 404, matching the previous behaviour.
          image={playlist?.image ?? stationLogoUrl(station.id)}
          className="aspect-square w-full max-w-[280px] rounded-2xl sm:max-w-none"
          textClassName="px-4 text-2xl leading-tight"
        />
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
            {tracks.length > 0 && (
              // Same overflow menu as the playlist page so Rewind
              // stations expose the same set of actions (copy XSPF
              // URL, download XSPF, share, etc.). The station's
              // upstream XSPF is the canonical playlist artifact;
              // pipe it through `xspfUrl` so the menu's download
              // entry hits the source directly.
              <TrackListActionsMenu
                title={`${station.name} Rewind`}
                creator={station.name}
                tracks={parachordTracks}
                xspfUrl={station.xspfUrl}
                xspfFilename={`${station.id}-rewind`}
                triggerLabel="Rewind actions"
              />
            )}
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
          {tracks.map((t, i) => (
            <RadioRewindRow
              key={`${t.title}-${i}`}
              index={i}
              title={t.title}
              creator={t.creator}
              album={t.album}
              initialCover={t.image}
            />
          ))}
        </ol>
      )}
    </PageShell>
  );
}
