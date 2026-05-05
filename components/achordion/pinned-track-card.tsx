import Link from "next/link";
import { Pin } from "lucide-react";
import { CoverArt } from "./cover-art";
import { caaUrlFromListen } from "@/lib/clients/coverart";
import type { PinnedRecording } from "@/lib/clients/listenbrainz";
import type { ArtistExternalLink } from "@/lib/clients/musicbrainz";
import { parachordPlayTrack } from "@/lib/parachord";
import { ParachordCtaButton } from "./parachord-button";
import { ExternalLinks } from "./external-links";
import { TrackActionsMenuSlot } from "./track-actions-menu-slot";
import { artistHref, releaseGroupHref } from "@/lib/entity-links";
import { cn } from "@/lib/utils";

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
  /** MB url-rels filtered to streaming services, fed to the favicon row.
   *  Optional — when omitted the row still renders the "+ Add sources"
   *  tile (provided the pin has a recording MBID). */
  streamingLinks?: ArtistExternalLink[];
  className?: string;
}

export function PinnedTrackCard({
  pin,
  variant = "row",
  streamingLinks,
  className,
}: PinnedTrackCardProps) {
  const meta = pin.track_metadata;
  const cover = caaUrlFromListen(meta, variant === "hero" ? 500 : 250);
  const recordingMbid =
    meta.mbid_mapping?.recording_mbid ??
    meta.additional_info?.recording_mbid ??
    pin.recording_mbid ??
    null;
  const isHero = variant === "hero";
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
      <div className={cn("flex gap-4", isHero ? "sm:gap-6" : "sm:gap-5")}>
        <CoverArt
          src={cover}
          alt={meta.release_name ?? meta.track_name}
          size={isHero ? 500 : 250}
          className={cn(
            "aspect-square h-auto shrink-0",
            isHero ? "w-32 sm:w-40" : "w-20 sm:w-24",
          )}
          rounded="md"
        />
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
              <ParachordCtaButton
                href={parachordPlayTrack({
                  artist: meta.artist_name,
                  title: meta.track_name,
                })}
                label="Play in Parachord"
                size="sm"
              />
              <TrackActionsMenuSlot track={trackRef} />
              {/* Always show the row when we have an MBID — empty
                  streaming list still gets the "+" affordance so users
                  can seed Spotify / Apple etc. on MB. */}
              {recordingMbid && (
                <ExternalLinks
                  links={streamingLinks ?? []}
                  addSources={{ mbEntity: "recording", mbid: recordingMbid }}
                />
              )}
            </div>
          )}
          {!isHero && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <ParachordCtaButton
                href={parachordPlayTrack({
                  artist: meta.artist_name,
                  title: meta.track_name,
                })}
                label="Play in Parachord"
                size="sm"
              />
              <TrackActionsMenuSlot track={trackRef} />
              {recordingMbid && (
                <ExternalLinks
                  links={streamingLinks ?? []}
                  addSources={{ mbEntity: "recording", mbid: recordingMbid }}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
