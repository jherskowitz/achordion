"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Play, Radio } from "lucide-react";
import type { LbRadioTrack } from "@/lib/clients/listenbrainz";
import { CoverArt } from "./cover-art";
import { caaReleaseUrl } from "@/lib/clients/coverart";
import {
  parachordPlayRadio,
  parachordPlayTrack,
  type ParachordTrack,
} from "@/lib/parachord";
import { useParachordPresence } from "@/lib/use-parachord-presence";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { PlayOverNumberCell } from "./parachord-button";
import { artistHref, recordingHref } from "@/lib/entity-links";
import { cn } from "@/lib/utils";

interface LbRadioSectionProps {
  /** Used in the heading ("{seedLabel} Radio") and Parachord fallback title. */
  seedLabel: string;
  tracks: LbRadioTrack[] | null;
  /**
   * Optional LB Radio endpoint URL. When supplied, Parachord uses it as
   * a refill source — the station extends itself rather than ending
   * after the initial pool runs out.
   */
  refillUrl?: string;
}

export function LbRadioSection({
  seedLabel,
  tracks,
  refillUrl,
}: LbRadioSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const parachordRunning = useParachordPresence();

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

  const playHref = parachordPlayRadio({
    tracks: parachordTracks,
    ...(refillUrl ? { refill: refillUrl } : {}),
    displayName: `${seedLabel} Radio`,
  });

  // The icon doubles as the "Play in Parachord" affordance — Radio
  // icon by default, Play icon on hover, brand-purple background
  // when Parachord is up. When Parachord isn't running we keep the
  // Radio glyph and let the IconTooltip surface that fact.
  const iconButtonBase =
    "group/playbtn flex size-9 shrink-0 items-center justify-center rounded-full transition-colors";
  const iconWrap = parachordRunning ? (
    <a
      href={playHref}
      aria-label={`Play ${seedLabel} Radio in Parachord`}
      className={cn(
        iconButtonBase,
        "bg-foreground/10 hover:text-white",
      )}
      style={{
        // Inline so :hover swaps cleanly to brand purple regardless
        // of the surrounding theme tokens.
        ["--play-bg" as string]: "#7c3aed",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "var(--play-bg)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "";
      }}
    >
      <Radio className="size-4 group-hover/playbtn:hidden" />
      <Play className="size-4 hidden fill-current group-hover/playbtn:block" />
    </a>
  ) : (
    <span
      aria-disabled
      className={cn(
        iconButtonBase,
        "bg-muted text-muted-foreground cursor-not-allowed",
      )}
    >
      <Radio className="size-4" />
    </span>
  );

  return (
    <div className="border-border/60 rounded-2xl border">
      <div className="flex flex-wrap items-center gap-3 p-5">
        <div className="flex flex-1 items-center gap-3">
          <IconTooltip
            side="top"
            align="start"
            label={
              parachordRunning
                ? `Play ${seedLabel} Radio in Parachord`
                : "Parachord isn't running"
            }
          >
            {iconWrap}
          </IconTooltip>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-wide uppercase">
              {seedLabel} Radio
            </h2>
            <p className="text-muted-foreground/80 text-xs">
              {tracks.length} tracks · LB Radio
            </p>
          </div>
        </div>
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
          className="border-border/60 max-h-[440px] overflow-y-auto rounded-b-2xl border-t px-5"
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
