"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Radio } from "lucide-react";
import type { LbRadioTrack } from "@/lib/clients/listenbrainz";
import { CoverArt } from "./cover-art";
import { caaReleaseUrl } from "@/lib/clients/coverart";
import { parachordPlayTrack, type ParachordTrack } from "@/lib/parachord";
import { OpenInParachordButton } from "./open-in-parachord-button";
import { PlayOverNumberCell } from "./parachord-button";
import { cn } from "@/lib/utils";

interface LbRadioSectionProps {
  /** Used in the heading ("{seedLabel} Radio") and Parachord fallback title. */
  seedLabel: string;
  tracks: LbRadioTrack[] | null;
}

export function LbRadioSection({
  seedLabel,
  tracks,
}: LbRadioSectionProps) {
  const [expanded, setExpanded] = useState(false);

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
    <div className="border-border/60 overflow-hidden rounded-2xl border">
      <div className="flex flex-wrap items-center gap-3 p-5">
        <div className="flex flex-1 items-center gap-3">
          <div className="bg-foreground/10 flex size-9 items-center justify-center rounded-full">
            <Radio className="size-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-wide uppercase">
              {seedLabel} Radio
            </h2>
            <p className="text-muted-foreground/80 text-xs">
              {tracks.length} tracks · LB Radio
            </p>
          </div>
        </div>
        <OpenInParachordButton
          tracks={parachordTracks}
          fallback={{
            title: `${seedLabel} Radio`,
            creator: "Achordion · LB Radio",
          }}
        />
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? "Hide tracks" : "Show all tracks"}
          aria-controls="lb-radio-tracks"
          className="text-muted-foreground hover:bg-muted/40 hover:text-foreground inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors"
        >
          <ChevronDown
            className={cn(
              "size-4 transition-transform duration-200",
              expanded && "rotate-180",
            )}
          />
        </button>
      </div>
      {expanded && (
        <div
          id="lb-radio-tracks"
          className="border-border/60 max-h-[440px] overflow-y-auto border-t px-5"
        >
          <ol className="divide-border/60 divide-y">
            {tracks.map((t, i) => {
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
                  <PlayOverNumberCell
                    number={i + 1}
                    href={parachordPlayTrack({
                      artist: t.artistName,
                      title: t.title,
                    })}
                    className="w-6"
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
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
