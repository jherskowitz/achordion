import Link from "next/link";
import { ExternalLink, Radio } from "lucide-react";
import type { LbRadioTrack } from "@/lib/clients/listenbrainz";
import { CoverArt } from "./cover-art";
import { caaReleaseUrl } from "@/lib/clients/coverart";
import {
  parachordImportPlaylist,
  parachordPlayTrack,
  type ParachordTrack,
} from "@/lib/parachord";
import { ParachordCtaButton, ParachordPlayButton } from "./parachord-button";

interface LbRadioSectionProps {
  artistMbid: string;
  artistName: string;
  tracks: LbRadioTrack[] | null;
}

const LB_RADIO_BASE = "https://listenbrainz.org/explore/lb-radio/";

export function LbRadioSection({
  artistMbid,
  artistName,
  tracks,
}: LbRadioSectionProps) {
  const externalUrl = `${LB_RADIO_BASE}?prompt=${encodeURIComponent(`artist:(${artistMbid})`)}&mode=easy`;

  if (!tracks || tracks.length === 0) {
    return (
      <div className="border-border/60 from-card/50 to-card/20 flex flex-col gap-3 rounded-2xl border bg-gradient-to-br p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex items-start gap-4">
          <div className="bg-foreground/10 flex size-10 shrink-0 items-center justify-center rounded-full">
            <Radio className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold tracking-tight">
              {artistName} Radio
            </h2>
            <p className="text-muted-foreground mt-1 text-sm leading-6">
              Generate a continuous radio session seeded from{" "}
              {artistName}&apos;s sound on ListenBrainz.
            </p>
          </div>
        </div>
        <a
          href={externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-primary text-primary-foreground inline-flex h-9 shrink-0 items-center gap-2 self-start rounded-lg px-4 text-sm font-medium hover:opacity-90 sm:self-auto"
        >
          Open in LB Radio
          <ExternalLink className="size-3.5" />
        </a>
      </div>
    );
  }

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
        <div className="flex items-center gap-3">
          <ParachordCtaButton
            href={parachordImportPlaylist({
              title: `${artistName} Radio`,
              creator: "Achordion · LB Radio",
              tracks: parachordTracks,
            })}
            label="Play in Parachord"
            size="sm"
          />
          <a
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs"
          >
            Open in LB Radio
            <ExternalLink className="size-3" />
          </a>
        </div>
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
