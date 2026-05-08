import { Suspense } from "react";
import Link from "next/link";
import { Pin } from "lucide-react";
import { CoverArt } from "./cover-art";
import { PlayOnHoverFab } from "./play-on-hover-fab";
import { caaUrlFromListen } from "@/lib/clients/coverart";
import type { PinnedRecording } from "@/lib/clients/listenbrainz";
import {
  getRecording,
  partitionArtistRelations,
} from "@/lib/clients/musicbrainz";
import { parachordPlayTrack } from "@/lib/parachord";
import { categoriseLinks } from "./external-links";
import { resolveTrackLinks } from "@/lib/track-links-resolver";
import { faviconUrl } from "@/lib/favicon";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { AddSourcesButton } from "./add-sources-button";
import { TrackActionsMenuSlot } from "./track-actions-menu-slot";
import { ThanksButton } from "./thanks-button";
import { Skeleton } from "@/components/ui/skeleton";
import { artistHref, releaseGroupHref } from "@/lib/entity-links";
import { cn } from "@/lib/utils";

/**
 * Async server component that resolves the recording's streaming
 * URLs (cache → MB url-rels → ISRC alias → Odesli) and renders the
 * favicon row directly into the SSR HTML. Server-side resolution is
 * the right shape here even though entity pages use a client island:
 *
 *   - Pins are 1-5 cards per page, low cost.
 *   - Eliminates client-side variability (extensions, hydration race,
 *     React Query state) that was leaving favicons missing on some
 *     pin renders.
 *   - Edge-cached HTML carries the favicons baked in, so repeat
 *     visitors get them instantly without a /api/track-links call.
 *
 * Wrapped in <Suspense> by the card so the rest of the pin paints
 * immediately while the resolver runs.
 */
async function PinnedExternalLinks({
  recordingMbid,
}: {
  recordingMbid: string;
}) {
  // Pre-fetch the recording's MB rels so the resolver doesn't make a
  // second MB roundtrip on a cache miss. We need it anyway for the
  // partitionArtistRelations / categoriseLinks call.
  const recording = await getRecording(recordingMbid).catch(() => null);
  const streamingMb = recording
    ? categoriseLinks(
        partitionArtistRelations({ relations: recording.relations }).urls,
      ).streaming
    : [];
  const links = await resolveTrackLinks({
    mbid: recordingMbid,
    entity: "recording",
    seedUrl: streamingMb[0]?.url ?? null,
    prefetched: {
      streamingUrls: streamingMb.map((s) => ({ url: s.url, type: s.type })),
      ...(recording
        ? {
            names: {
              trackName: recording.title,
              ...(recording["artist-credit"]?.[0]?.name
                ? {
                    artistName: recording["artist-credit"]
                      .map((c) => c.name + (c.joinphrase ?? ""))
                      .join("")
                      .trim(),
                  }
                : {}),
            },
          }
        : {}),
    },
  });
  return (
    <ul className="flex flex-wrap items-center gap-2" role="list">
      {links.map((link) => (
        <li key={link.url}>
          <IconTooltip label={link.label}>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={link.label}
              suppressHydrationWarning
              className="border-border/60 hover:border-foreground/40 hover:bg-muted/40 inline-flex size-9 items-center justify-center rounded-md border transition-colors pointer-coarse:size-11"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={faviconUrl(link.host)}
                alt=""
                width={16}
                height={16}
                loading="lazy"
                className="size-4 opacity-80 hover:opacity-100"
              />
            </a>
          </IconTooltip>
        </li>
      ))}
      <li>
        <AddSourcesButton mbEntity="recording" mbid={recordingMbid} />
      </li>
    </ul>
  );
}

/**
 * Skeleton for the favicon row — five `size-9` muted squares with the
 * same `gap-2 flex-wrap` rhythm as the real <ExternalLinks> output, so
 * the slot doesn't shift when the data arrives.
 */
function PinnedExternalLinksSkeleton() {
  return (
    <div className="flex flex-wrap gap-2" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="size-9 rounded-md" />
      ))}
    </div>
  );
}

function relativeFromNow(unixSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = unixSeconds - now;
  const abs = Math.abs(diff);
  if (abs < 60) return diff < 0 ? "just now" : "in seconds";
  if (abs < 3600) {
    const mins = Math.floor(abs / 60);
    return diff < 0 ? `${mins}m ago` : `in ${mins}m`;
  }
  if (abs < 86400) {
    const hrs = Math.floor(abs / 3600);
    return diff < 0 ? `${hrs}h ago` : `in ${hrs}h`;
  }
  const days = Math.floor(abs / 86400);
  return diff < 0 ? `${days}d ago` : `in ${days}d`;
}

function PinnedByline({
  meta,
}: {
  meta: PinnedRecording["track_metadata"];
}) {
  const artistMbid =
    meta.mbid_mapping?.artist_mbids?.[0] ??
    meta.additional_info?.artist_mbids?.[0];
  return (
    <>
      <Link
        href={artistHref({ mbid: artistMbid, name: meta.artist_name })}
        className="hover:text-foreground"
      >
        {meta.artist_name}
      </Link>
      {meta.release_name && (
        <>
          <span className="opacity-50"> · </span>
          <Link
            href={releaseGroupHref({
              artist: meta.artist_name,
              title: meta.release_name,
            })}
            className="italic hover:text-foreground hover:underline"
          >
            {meta.release_name}
          </Link>
        </>
      )}
    </>
  );
}

interface PinnedTrackCardProps {
  pin: PinnedRecording;
  /** Hero variant — bigger, more prominent. Used at the top of the overview. */
  variant?: "hero" | "row";
  className?: string;
  /**
   * When true, render a Thanks button alongside the existing actions.
   * Caller is responsible for only setting this on pins the viewer
   * can thank — i.e. not the viewer's own pins (LB 403s on those).
   * If the viewer doesn't follow the pin owner LB will still 4xx; the
   * button surfaces the error in its tooltip rather than pre-filtering.
   */
  thankable?: boolean;
}

export function PinnedTrackCard({
  pin,
  variant = "row",
  className,
  thankable = false,
}: PinnedTrackCardProps) {
  const meta = pin.track_metadata;
  const cover = caaUrlFromListen(meta, variant === "hero" ? 500 : 250);
  const recordingMbid =
    meta.mbid_mapping?.recording_mbid ??
    meta.additional_info?.recording_mbid ??
    pin.recording_mbid ??
    null;
  const isHero = variant === "hero";
  // Server component: Date.now() is request-time, not a re-render
  // hazard — purity rule doesn't apply here.
  // eslint-disable-next-line react-hooks/purity
  const now = Math.floor(Date.now() / 1000);
  const isActive = pin.pinned_until > now;

  const trackRef = {
    recordingMbid,
    trackName: meta.track_name,
    artistName: meta.artist_name,
    releaseMbid:
      meta.mbid_mapping?.release_mbid ??
      meta.additional_info?.release_mbid ??
      null,
  };
  return (
    <article
      className={cn(
        "border-border/60 from-card/40 to-card/10 rounded-2xl border bg-gradient-to-br",
        isHero ? "p-5 sm:p-6" : "p-4",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-start gap-4",
          isHero ? "sm:gap-6" : "sm:gap-5",
        )}
      >
        {/* Same cover-art-with-hover-play treatment as the recording
            and album page headers — playback affordance lives on the
            artwork, not as a separate pill below the byline. */}
        <div
          className={cn(
            "group relative aspect-square h-auto shrink-0 overflow-hidden rounded-md",
            isHero ? "w-32 sm:w-40" : "w-20 sm:w-24",
          )}
        >
          <CoverArt
            src={cover}
            alt={meta.release_name ?? meta.track_name}
            size={isHero ? 500 : 250}
            className="aspect-square w-full"
            rounded="none"
          />
          <PlayOnHoverFab
            href={parachordPlayTrack({
              artist: meta.artist_name,
              title: meta.track_name,
            })}
            label={`Play "${meta.track_name}" by ${meta.artist_name} in Parachord`}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="text-muted-foreground inline-flex items-center gap-1.5 text-xs tracking-wide uppercase">
            <Pin className="size-3" />
            {isActive ? "Pinned" : "Was pinned"}
            <span className="text-muted-foreground/60 ml-1 normal-case tracking-normal">
              · pinned {relativeFromNow(pin.created)}
              {isActive && (
                <>
                  {" "}
                  · expires {relativeFromNow(pin.pinned_until)}
                </>
              )}
            </span>
          </p>
          <h3
            className={cn(
              "mt-1.5 truncate font-semibold tracking-tight",
              isHero ? "text-xl sm:text-2xl" : "text-base",
            )}
          >
            {recordingMbid ? (
              <Link
                href={`/recording/${recordingMbid}`}
                className="hover:underline"
              >
                {meta.track_name}
              </Link>
            ) : (
              meta.track_name
            )}
          </h3>
          <p
            className={cn(
              "text-muted-foreground truncate",
              isHero ? "mt-1 text-sm" : "text-xs",
            )}
          >
            <PinnedByline meta={meta} />
          </p>
          {pin.blurb_content && (
            <blockquote
              className={cn(
                "border-foreground/20 text-foreground/80 mt-3 border-l-2 pl-3 italic",
                isHero ? "text-sm leading-6" : "text-xs leading-5",
              )}
            >
              &ldquo;{pin.blurb_content}&rdquo;
            </blockquote>
          )}
          {isHero && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {/* Play affordance lives on the cover (hover fab); the
                  action row carries the overflow ⋮ + thanks +
                  streaming-favicon row. */}
              <TrackActionsMenuSlot track={trackRef} />
              {thankable && (
                <ThanksButton
                  originalEventType="recording_pin"
                  originalEventId={pin.row_id}
                />
              )}
              {/* Streaming favicons stream in via Suspense so the
                  Parachord button + ⋮ paint immediately. The "+" tile
                  always renders once the row resolves, even if MB has
                  no streaming rels for this recording. */}
              {recordingMbid && (
                <Suspense fallback={<PinnedExternalLinksSkeleton />}>
                  <PinnedExternalLinks recordingMbid={recordingMbid} />
                </Suspense>
              )}
            </div>
          )}
          {!isHero && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <TrackActionsMenuSlot track={trackRef} />
              {thankable && (
                <ThanksButton
                  originalEventType="recording_pin"
                  originalEventId={pin.row_id}
                />
              )}
              {recordingMbid && (
                <Suspense fallback={<PinnedExternalLinksSkeleton />}>
                  <PinnedExternalLinks recordingMbid={recordingMbid} />
                </Suspense>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
