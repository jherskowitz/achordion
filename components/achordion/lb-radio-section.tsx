import Link from "next/link";
import { Radio } from "lucide-react";
import type { LbRadioTrack } from "@/lib/clients/listenbrainz";
import { CoverArt } from "./cover-art";
import { caaReleaseUrl } from "@/lib/clients/coverart";
import { parachordPlayTrack, type ParachordTrack } from "@/lib/parachord";
import { OpenInParachordButton } from "./open-in-parachord-button";
import { ParachordPlayButton } from "./parachord-button";

interface LbRadioSectionProps {
  artistMbid: string;
  artistName: string;
  tracks: LbRadioTrack[] | null;
}

export function LbRadioSection({
  artistName,
  tracks,
}: LbRadioSectionProps) {
  // No token / fetch failure → don't render the section. There's nothing
  // to queue into Parachord without a tracklist, and the section is
  // intentionally Parachord-only now.
  if (!tracks || tracks.length === 0) return null;

  const parachordTracks: ParachordTrack[] = tracks.map((t) => ({
    title: t.title,
    artist: t.artistName,
    ...(t.releaseName ? { album: t.releaseName } : {}),
    ...(t.durationMs ? { duration: Math.round(t.durationMs / 1000) } : {}),
  }));

  return (
    <div className="border-border/60 rounded-2xl border p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="bg-foreground/10 flex size-9 items-center justify-center rounded-full">
            <Radio className="size-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-wide uppercase">
              {artistName} Radio
            </h2>
            <p className="text-muted-foreground/80 text-xs">
              {tracks.length} tracks · LB Radio
            </p>
          </div>
        </div>
        <OpenInParachordButton
          tracks={parachordTracks}
          fallback={{
            title: `${artistName} Radio`,
            creator: "Achordion · LB Radio",
          }}
        />
      </div>
      <ol className="divide-border/60 divide-y">
        {tracks.slice(0, 12).map((t, i) => {
          const cover =
            t.caaReleaseMbid && t.caaId
              ? `https://archive.org/download/mbid-${t.caaReleaseMbid}/mbid-${t.caaReleaseMbid}-${t.caaId}_thumb250.jpg`
              : t.releaseMbid
                ? caaReleaseUrl(t.releaseMbid, 250)
                : null;
          return (
            <li
              key={`${t.recordingMbid ?? t.title}-${i}`}
              className="group flex items-center gap-3 py-2.5"
            >
              <span className="text-muted-foreground w-5 shrink-0 text-xs tabular-nums">
                {i + 1}
              </span>
              <CoverArt src={cover} alt={t.releaseName ?? t.title} size={40} />
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
                </p>
              </div>
              <ParachordPlayButton
                href={parachordPlayTrack({
                  artist: t.artistName,
                  title: t.title,
                })}
              />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
