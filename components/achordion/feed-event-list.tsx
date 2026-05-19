import { Suspense } from "react";
import Link from "next/link";
import {
  Pin,
  Play,
  UserPlus,
  Bell,
  Sparkles,
  Mail,
  Music,
  MessageSquareQuote,
  HandHeart,
  Heart,
  Radio,
  Star,
  Link2,
} from "lucide-react";
import { CoverArt } from "./cover-art";
import { InlineTrackLinks } from "./inline-track-links";
import { RelativeTime } from "./relative-time";
import { ThanksButton } from "./thanks-button";
import { TrackActionsMenu } from "./track-actions-menu";
import { MentionText } from "./mention-text";
import {
  caaReleaseGroupUrl,
  caaUrlFromListen,
} from "@/lib/clients/coverart";
import { parachordPlayTrack } from "@/lib/parachord";
import {
  artistHref,
  recordingHref,
  releaseGroupHref,
} from "@/lib/entity-links";
import {
  getRecordingMetadata,
  getUserPins,
  type FeedEvent,
} from "@/lib/clients/listenbrainz";
import {
  getArtist,
  getReleaseGroup,
} from "@/lib/clients/musicbrainz";
import { PinnedTrackCard } from "./pinned-track-card";

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// ─── Shared track-display helper ────────────────────────────────────
//
// Pin / listen / recording_recommendation / personal_recording_
// recommendation all have the same "track row" body — cover-as-play,
// linked title, linked artist, optional blurb. Refactored into one
// helper so the per-event renderers stay short and the rendering stays
// consistent across event types.

interface TrackMetaShape {
  track_name?: string;
  artist_name?: string;
  release_name?: string | null;
  additional_info?: {
    recording_mbid?: string | null;
    release_mbid?: string | null;
    artist_mbids?: string[] | null;
  };
  mbid_mapping?: {
    recording_mbid?: string | null;
    release_mbid?: string | null;
    artist_mbids?: string[] | null;
    caa_id?: number | string | null;
    caa_release_mbid?: string | null;
  };
}

function toTrackRef(
  meta: TrackMetaShape | null | undefined,
  ownerUsername?: string,
  listenedAt?: number,
): import("./track-actions-menu").TrackRef | null {
  if (!meta?.track_name || !meta.artist_name) return null;
  const recordingMbid =
    meta.additional_info?.recording_mbid ??
    meta.mbid_mapping?.recording_mbid ??
    null;
  const releaseMbid =
    meta.additional_info?.release_mbid ??
    meta.mbid_mapping?.release_mbid ??
    null;
  return {
    trackName: meta.track_name,
    artistName: meta.artist_name,
    recordingMbid,
    releaseMbid,
    ...(listenedAt ? { listenedAt } : {}),
    ...(ownerUsername ? { ownerUsername } : {}),
  };
}

/**
 * Trailing slot for track-bearing event cards. Combines the existing
 * Thanks button (when applicable) with a per-track overflow menu so
 * viewers can love / queue / add-to-playlist / etc. straight from
 * the feed without click-through to the track page.
 */
function TrackEventTrailing({
  trackMeta,
  viewer,
  ownerUsername,
  listenedAt,
  thanks,
}: {
  trackMeta: TrackMetaShape | null | undefined;
  viewer: string | null;
  ownerUsername?: string;
  listenedAt?: number;
  thanks?: React.ReactNode;
}) {
  const ref = toTrackRef(trackMeta, ownerUsername, listenedAt);
  const viewerObj = viewer ? { mbUsername: viewer } : null;
  const recordingMbid =
    trackMeta?.additional_info?.recording_mbid ??
    trackMeta?.mbid_mapping?.recording_mbid ??
    null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <InlineTrackLinks recordingMbid={recordingMbid} />
      {thanks}
      {ref && viewerObj && (
        <TrackActionsMenu track={ref} viewer={viewerObj} />
      )}
    </span>
  );
}

function TrackEventBody({
  trackMeta,
  blurb,
}: {
  trackMeta: TrackMetaShape | undefined;
  blurb?: string | null;
}) {
  const trackName = trackMeta?.track_name ?? "Unknown track";
  const artistName = trackMeta?.artist_name ?? "Unknown artist";
  const recordingMbid =
    trackMeta?.mbid_mapping?.recording_mbid ??
    trackMeta?.additional_info?.recording_mbid ??
    null;
  const artistMbid =
    trackMeta?.mbid_mapping?.artist_mbids?.[0] ??
    trackMeta?.additional_info?.artist_mbids?.[0] ??
    null;
  const cover = trackMeta
    ? caaUrlFromListen(
        {
          additional_info: trackMeta.additional_info
            ? {
                release_mbid:
                  trackMeta.additional_info.release_mbid ?? undefined,
              }
            : undefined,
          mbid_mapping: trackMeta.mbid_mapping
            ? {
                release_mbid:
                  trackMeta.mbid_mapping.release_mbid ?? undefined,
                caa_id: trackMeta.mbid_mapping.caa_id ?? undefined,
                caa_release_mbid:
                  trackMeta.mbid_mapping.caa_release_mbid ?? undefined,
              }
            : undefined,
        },
        250,
      )
    : null;
  return (
    <div className="mt-2 flex items-start gap-3">
      <a
        href={parachordPlayTrack({ artist: artistName, title: trackName })}
        aria-label={`Play "${trackName}" by ${artistName} in Parachord`}
        title="Play in Parachord"
        className="group/cover relative shrink-0 overflow-hidden rounded-md"
      >
        <CoverArt src={cover} alt={trackName} size={48} />
        <span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 transition-opacity group-hover/cover:opacity-100 pointer-coarse:opacity-100 pointer-coarse:bg-black/30"
        >
          <Play className="size-4 fill-white text-white" />
        </span>
      </a>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          <Link
            href={recordingHref({
              mbid: recordingMbid,
              artist: artistName,
              title: trackName,
            })}
            className="hover:underline"
          >
            {trackName}
          </Link>
        </p>
        <p className="text-muted-foreground truncate text-xs">
          <Link
            href={artistHref({ mbid: artistMbid, name: artistName })}
            className="hover:text-foreground"
          >
            {artistName}
          </Link>
        </p>
        {blurb && (
          <p className="text-foreground/80 mt-1.5 text-sm leading-5 italic">
            “<MentionText text={blurb} />”
          </p>
        )}
      </div>
    </div>
  );
}

function EventShell({
  icon,
  header,
  trailing,
  children,
}: {
  icon: React.ReactNode;
  header: React.ReactNode;
  /** Optional inline trailing slot for action buttons (e.g. Thanks). */
  trailing?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    // `items-center` so the trailing slot vertically centers against
    // the whole row (header + content block). The icon overrides via
    // `self-start` to stay top-anchored alongside the header line.
    <li className="flex items-center gap-3 py-3">
      <div className="bg-muted/60 mt-0.5 flex size-8 shrink-0 items-center justify-center self-start rounded-full">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground text-xs">{header}</p>
        {children}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </li>
  );
}

function UserLink({ name }: { name: string | null | undefined }) {
  if (!name) return <span className="text-foreground">Someone</span>;
  return (
    <Link
      href={`/user/${encodeURIComponent(name)}`}
      className="text-foreground hover:underline"
    >
      {name}
    </Link>
  );
}

// ─── recording_pin ──────────────────────────────────────────────────

interface PinTrackMeta {
  track_metadata?: TrackMetaShape;
  blurb_content?: string | null;
}

function PinEvent({ event, viewer }: { event: FeedEvent; viewer: string | null }) {
  const m = event.metadata as PinTrackMeta | undefined;
  const tm = m?.track_metadata;
  const isOwn = viewer && event.user_name && viewer === event.user_name;
  const canThank = !isOwn && typeof event.id === "number";
  return (
    <EventShell
      icon={<Pin className="size-4" />}
      header={
        <>
          <UserLink name={event.user_name} /> pinned a track
          <span className="text-muted-foreground/70">
            {" · "}
            <RelativeTime value={event.created} />
          </span>
        </>
      }
      trailing={
        <TrackEventTrailing
          trackMeta={tm}
          viewer={viewer}
          ownerUsername={event.user_name}
          thanks={
            canThank ? (
              <ThanksButton
                originalEventType="recording_pin"
                originalEventId={event.id as number}
                size="compact"
              />
            ) : null
          }
        />
      }
    >
      <TrackEventBody trackMeta={tm} blurb={m?.blurb_content} />
    </EventShell>
  );
}

// ─── listen ─────────────────────────────────────────────────────────
//
// LB inserts curated scrobbles from people you follow into the feed —
// not every play, just timeline-worthy ones. Metadata is the regular
// listen shape (track_metadata + listened_at).

interface ListenMeta {
  track_metadata?: TrackMetaShape;
  listened_at?: number;
}

function ListenEvent({
  event,
  viewer,
}: {
  event: FeedEvent;
  viewer: string | null;
}) {
  const m = event.metadata as ListenMeta | undefined;
  const when = m?.listened_at ?? event.created;
  return (
    <EventShell
      icon={<Music className="size-4" />}
      header={
        <>
          <UserLink name={event.user_name} /> listened
          <span className="text-muted-foreground/70">
            {" · "}
            <RelativeTime value={when} />
          </span>
        </>
      }
      trailing={
        <TrackEventTrailing
          trackMeta={m?.track_metadata}
          viewer={viewer}
          ownerUsername={event.user_name}
          listenedAt={m?.listened_at}
        />
      }
    >
      <TrackEventBody trackMeta={m?.track_metadata} />
    </EventShell>
  );
}

// ─── loved_recording (synthetic — see getLovedRecordingEvents) ──────

interface LoveMeta {
  track_metadata?: TrackMetaShape;
  recording_mbid?: string | null;
}

function LovedRecordingEvent({
  event,
  viewer,
}: {
  event: FeedEvent;
  viewer: string | null;
}) {
  const m = event.metadata as LoveMeta | undefined;
  return (
    <EventShell
      // Red filled heart — universal "loved" affordance. (Other
      // app surfaces use emerald for loved state to match the
      // play / on-air color palette, but on a feed card the
      // expected mental model is red = love.)
      icon={
        <Heart
          className="size-4 fill-rose-500/90 text-rose-500/90"
          aria-hidden="true"
        />
      }
      header={
        <>
          <UserLink name={event.user_name} /> loved a track
          <span className="text-muted-foreground/70">
            {" · "}
            <RelativeTime value={event.created} />
          </span>
        </>
      }
      trailing={
        <TrackEventTrailing
          trackMeta={m?.track_metadata}
          viewer={viewer}
          ownerUsername={event.user_name}
        />
      }
    >
      <TrackEventBody trackMeta={m?.track_metadata} />
    </EventShell>
  );
}

// ─── recording_recommendation (public) ──────────────────────────────

interface RecommendationMeta {
  track_metadata?: TrackMetaShape;
  blurb_content?: string | null;
}

function RecordingRecommendationEvent({
  event,
  viewer,
}: {
  event: FeedEvent;
  viewer: string | null;
}) {
  const m = event.metadata as RecommendationMeta | undefined;
  const isOwn = viewer && event.user_name && viewer === event.user_name;
  const canThank = !isOwn && typeof event.id === "number";
  return (
    <EventShell
      icon={<Sparkles className="size-4" />}
      header={
        <>
          <UserLink name={event.user_name} /> recommended a track
          <span className="text-muted-foreground/70">
            {" · "}
            <RelativeTime value={event.created} />
          </span>
        </>
      }
      trailing={
        <TrackEventTrailing
          trackMeta={m?.track_metadata}
          viewer={viewer}
          ownerUsername={event.user_name}
          thanks={
            canThank ? (
              <ThanksButton
                originalEventType="recording_recommendation"
                originalEventId={event.id as number}
                size="compact"
              />
            ) : null
          }
        />
      }
    >
      <TrackEventBody trackMeta={m?.track_metadata} blurb={m?.blurb_content} />
    </EventShell>
  );
}

// ─── personal_recording_recommendation (private rec to you) ─────────

interface PersonalRecMeta {
  track_metadata?: TrackMetaShape;
  blurb_content?: string | null;
  users?: string[];
}

function PersonalRecommendationEvent({
  event,
  viewer,
}: {
  event: FeedEvent;
  viewer: string | null;
}) {
  const m = event.metadata as PersonalRecMeta | undefined;
  const isOwn = viewer && event.user_name && viewer === event.user_name;
  const canThank = !isOwn && typeof event.id === "number";
  return (
    <EventShell
      icon={<Mail className="size-4" />}
      header={
        <>
          <UserLink name={event.user_name} /> sent you a track
          <span className="text-muted-foreground/70">
            {" · "}
            <RelativeTime value={event.created} />
          </span>
        </>
      }
      trailing={
        <TrackEventTrailing
          trackMeta={m?.track_metadata}
          viewer={viewer}
          ownerUsername={event.user_name}
          thanks={
            canThank ? (
              <ThanksButton
                originalEventType="personal_recording_recommendation"
                originalEventId={event.id as number}
                size="compact"
              />
            ) : null
          }
        />
      }
    >
      <TrackEventBody trackMeta={m?.track_metadata} blurb={m?.blurb_content} />
    </EventShell>
  );
}

// ─── review (CritiqueBrainz) ────────────────────────────────────────

/**
 * LB's feed endpoint emits CritiqueBrainz reviews as `event_type:
 * "review"`. We originally guessed the type string would be
 * `"critiquebrainz_review"` and dispatched on that, which meant the
 * renderer existed but never matched a real event — reviews from
 * followed users silently dropped out of /feed. Match both strings
 * so we're forward-compatible with any LB rename.
 */
function isReviewEvent(e: FeedEvent): boolean {
  return e.event_type === "review" || e.event_type === "critiquebrainz_review";
}

interface ReviewMeta {
  entity_id?: string;
  entity_name?: string;
  entity_type?: "recording" | "release_group" | "artist";
  rating?: number | null;
  text?: string;
  review_mbid?: string | null;
  user_name?: string;
}

function entityHrefFor(
  entityType: ReviewMeta["entity_type"],
  entityId: string | undefined,
  name: string | undefined,
): string | null {
  if (!entityId) return null;
  switch (entityType) {
    case "recording":
      return name ? recordingHref({ mbid: entityId, artist: "", title: name }) : `/recording/${entityId}`;
    case "release_group":
      return releaseGroupHref({ mbid: entityId, artist: "", title: name ?? "" });
    case "artist":
      return artistHref({ mbid: entityId, name: name ?? "" });
    default:
      return null;
  }
}

function CritiqueBrainzReviewEvent({
  event,
  coverUrl,
  entityName: resolvedName,
}: {
  event: FeedEvent;
  /** Pre-resolved CAA URL for the reviewed entity. null when no
   *  cover is available (artist reviews, or recordings whose
   *  release-group lookup didn't return CAA hints). */
  coverUrl: string | null;
  /** Pre-resolved entity name (from MB / LB), overrides the
   *  metadata-supplied name when both exist. null when no resolution
   *  succeeded — falls through to "an entity" then. */
  entityName?: string | null;
}) {
  const m = event.metadata as ReviewMeta | undefined;
  const entityName = resolvedName ?? m?.entity_name ?? "an entity";
  const entityHref = entityHrefFor(m?.entity_type, m?.entity_id, m?.entity_name);
  const rating = m?.rating ?? null;
  // Reviews can be long; truncate to a single visible chunk and let
  // the user click through to CB if they want the full text.
  const snippet = m?.text ? stripHtml(m.text).slice(0, 240) : "";
  const showEllipsis = (m?.text?.length ?? 0) > 240;
  return (
    <EventShell
      icon={<MessageSquareQuote className="size-4" />}
      header={
        <>
          <UserLink name={event.user_name} /> reviewed{" "}
          {entityHref ? (
            <Link href={entityHref} className="text-foreground hover:underline">
              {entityName}
            </Link>
          ) : (
            <span className="text-foreground">{entityName}</span>
          )}
          <span className="text-muted-foreground/70">
            {" · "}
            <RelativeTime value={event.created} />
          </span>
        </>
      }
    >
      <div className="mt-2 flex items-start gap-3">
        {/* Cover art for release_group / recording reviews so the
            card reads as visually consistent with the pin/listen
            cards above and below it. Artist reviews and reviews
            whose entity didn't resolve a CAA hint render without
            a cover slot — the placeholder Disc3 inside <CoverArt>
            would be misleading for "artist reviewed" copy. */}
        {coverUrl &&
          (entityHref ? (
            <Link
              href={entityHref}
              className="shrink-0 overflow-hidden rounded-md"
            >
              <CoverArt src={coverUrl} alt={entityName} size={48} />
            </Link>
          ) : (
            <span className="block shrink-0 overflow-hidden rounded-md">
              <CoverArt src={coverUrl} alt={entityName} size={48} />
            </span>
          ))}
        <div className="min-w-0 flex-1 space-y-1.5">
          {rating !== null && rating !== undefined && (
            <p className="text-muted-foreground/80 inline-flex items-center gap-0.5 text-xs">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={
                    i < rating
                      ? "size-3 fill-current text-foreground/80"
                      : "size-3 text-muted-foreground/30"
                  }
                />
              ))}
            </p>
          )}
          {snippet && (
            <p className="text-foreground/80 text-sm leading-5 italic">
              “{snippet}
              {showEllipsis ? "…" : ""}”
            </p>
          )}
        </div>
      </div>
    </EventShell>
  );
}

// ─── thanks ─────────────────────────────────────────────────────────

interface ThanksMeta {
  thanker_username?: string;
  thankee_username?: string;
  blurb_content?: string | null;
  original_event_type?: string;
  /** Row ID of the thanked event (for thanks-on-pin, this is the
   *  thankee's pin row_id). Lets us look up the actual track that
   *  was thanked so it can be shown + played in this event row. */
  original_event_id?: number;
}

const ORIGINAL_LABEL: Record<string, string> = {
  recording_pin: "pin",
  recording_recommendation: "recommendation",
  personal_recording_recommendation: "personal recommendation",
};

/**
 * Async server component that fetches the thankee's pin history
 * and renders the pinned track that was thanked. Wrapped in
 * <Suspense fallback={null}> by the caller — the rest of the
 * thanks event paints immediately and this preview streams in
 * when LB resolves.
 *
 * Pin lookup: scans up to 25 of the thankee's most recent pins
 * for one whose `row_id` matches the thanks event's
 * `original_event_id`. Most pins remain reachable for this
 * window; older / expired pins outside it gracefully fall back
 * to the text-only event display.
 */
async function ThankedPinPreview({
  thankee,
  originalEventId,
}: {
  thankee: string | undefined;
  originalEventId: number | undefined;
}) {
  if (!thankee || !originalEventId) return null;
  const pins = await getUserPins(thankee, 25).catch(() => []);
  const pin = pins.find((p) => p.row_id === originalEventId);
  if (!pin) return null;
  // Compact PinnedTrackCard inside the event row gives the
  // followed listener cover art + title + artist + play affordance
  // + the streaming-favicon row, so a thanks event becomes a
  // playable signal that propagates the recommendation rather
  // than a flat string.
  return (
    <div className="mt-3">
      <PinnedTrackCard pin={pin} variant="row" />
    </div>
  );
}

function ThanksEvent({ event }: { event: FeedEvent }) {
  const m = event.metadata as ThanksMeta | undefined;
  const thanker = m?.thanker_username ?? event.user_name;
  const thankee = m?.thankee_username;
  const what = m?.original_event_type
    ? (ORIGINAL_LABEL[m.original_event_type] ?? "event")
    : "event";
  return (
    <EventShell
      icon={<HandHeart className="size-4" />}
      header={
        <>
          <UserLink name={thanker} /> thanked <UserLink name={thankee} /> for
          their {what}
          <span className="text-muted-foreground/70">
            {" · "}
            <RelativeTime value={event.created} />
          </span>
        </>
      }
    >
      {m?.blurb_content && (
        <p className="text-foreground/80 mt-1.5 text-sm leading-5 italic">
          “{m.blurb_content}”
        </p>
      )}
      {m?.original_event_type === "recording_pin" && (
        <Suspense fallback={null}>
          <ThankedPinPreview
            thankee={thankee}
            originalEventId={m?.original_event_id}
          />
        </Suspense>
      )}
    </EventShell>
  );
}

// ─── follow ─────────────────────────────────────────────────────────

interface FollowMeta {
  user_name_0?: string;
  user_name_1?: string;
  relationship_type?: string;
}

function FollowEvent({ event }: { event: FeedEvent }) {
  const m = event.metadata as FollowMeta | undefined;
  return (
    <EventShell
      icon={<UserPlus className="size-4" />}
      header={
        // No nested `text-muted-foreground` span around "started
        // following" — the EventShell wrapper is already muted, so the
        // inner span was a no-op double-wrap that varied this row's
        // typography slightly from the others.
        <>
          <UserLink name={m?.user_name_0} /> started following{" "}
          <UserLink name={m?.user_name_1} />
          <span className="text-muted-foreground/70">
            {" · "}
            <RelativeTime value={event.created} />
          </span>
        </>
      }
    />
  );
}

// ─── notification ───────────────────────────────────────────────────

interface NotificationMeta {
  message?: string;
}

// ─── bsky_friend_linked ─────────────────────────────────────────────

interface BskyFriendLinkedEventMeta {
  bsky_handle?: string;
  bsky_display_name?: string;
  bsky_avatar?: string;
}

function BskyFriendLinkedEvent({ event }: { event: FeedEvent }) {
  const m = event.metadata as BskyFriendLinkedEventMeta | undefined;
  const lbName = event.user_name ?? null;
  const handle = m?.bsky_handle;
  const displayName = m?.bsky_display_name;
  const avatar = m?.bsky_avatar;
  return (
    <EventShell
      icon={
        // Generic linkage icon — keeps the row aligned with the
        // other event types' Lucide glyphs. The card body contains
        // the explicit "Bluesky" attribution + a deep link to the
        // friend's bsky.app profile.
        <Link2 className="size-4" />
      }
      header={
        <>
          <UserLink name={lbName} /> linked their Bluesky to Achordion
          <span className="text-muted-foreground/70">
            {" · "}
            <RelativeTime value={event.created} />
          </span>
        </>
      }
    >
      {handle && (
        <a
          href={`https://bsky.app/profile/${handle}`}
          target="_blank"
          rel="noopener noreferrer"
          className="border-border/60 bg-card/30 hover:bg-card/60 mt-2 inline-flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm transition-colors"
        >
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatar}
              alt=""
              width={20}
              height={20}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="size-5 shrink-0 rounded-full object-cover"
            />
          ) : null}
          <span className="text-foreground/90">
            {displayName ?? `@${handle}`}
          </span>
          <span className="text-muted-foreground text-xs">
            @{handle} · Bluesky
          </span>
        </a>
      )}
    </EventShell>
  );
}

// ─── listen_along ───────────────────────────────────────────────────

interface ListenAlongEventMeta {
  from_user?: string;
  to_user?: string;
}

function ListenAlongEvent({
  event,
  viewer,
}: {
  event: FeedEvent;
  viewer: string | null;
}) {
  const m = event.metadata as ListenAlongEventMeta | undefined;
  const fromUser = event.user_name ?? m?.from_user ?? null;
  const toUser = m?.to_user ?? null;
  // Three framings depending on which side of the listen-along the
  // viewer is on:
  //   - viewer is the actor:   "You listened along with X in Parachord"
  //   - viewer is the target:  "X tuned into your stream in Parachord"
  //   - viewer is a follower:  "X listened along with Y in Parachord"
  //
  // The actor-side framing is the one that surfaces a user's own
  // listen-along clicks in their own feed alongside their pins /
  // loves / etc.
  const viewerIsActor =
    !!viewer && !!fromUser && viewer.toLowerCase() === fromUser.toLowerCase();
  const viewerIsTarget =
    !!viewer && !!toUser && viewer.toLowerCase() === toUser.toLowerCase();
  return (
    <EventShell
      icon={<Radio className="size-4" />}
      header={
        <>
          {viewerIsActor ? (
            <>
              <span className="text-foreground">You</span> listened along
              with <UserLink name={toUser} /> in Parachord
            </>
          ) : viewerIsTarget ? (
            <>
              <UserLink name={fromUser} /> tuned into your stream in
              Parachord
            </>
          ) : (
            <>
              <UserLink name={fromUser} /> listened along with{" "}
              <UserLink name={toUser} /> in Parachord
            </>
          )}
          <span className="text-muted-foreground/70">
            {" · "}
            <RelativeTime value={event.created} />
          </span>
        </>
      }
    />
  );
}

// ─── playlist_published ─────────────────────────────────────────────

interface PlaylistPublishedEventMeta {
  mbid?: string;
  owner?: string;
  title?: string;
}

function PlaylistPublishedEvent({ event }: { event: FeedEvent }) {
  const m = event.metadata as PlaylistPublishedEventMeta | undefined;
  const owner = event.user_name ?? m?.owner ?? null;
  const mbid = m?.mbid ?? null;
  const title = m?.title ?? "a playlist";
  return (
    <EventShell
      icon={<Music className="size-4" />}
      header={
        <>
          <UserLink name={owner} /> published a playlist
          <span className="text-muted-foreground/70">
            {" · "}
            <RelativeTime value={event.created} />
          </span>
        </>
      }
    >
      <p className="text-foreground/90 mt-1 text-sm">
        {mbid ? (
          <Link
            href={`/playlist/${mbid}`}
            className="hover:underline underline-offset-4"
          >
            {title}
          </Link>
        ) : (
          <span>{title}</span>
        )}
      </p>
    </EventShell>
  );
}

// ─── mention ────────────────────────────────────────────────────────

interface MentionEventMeta {
  row_id?: number;
  from_user?: string;
  recording_mbid?: string | null;
  track_name?: string | null;
  artist_name?: string | null;
  blurb?: string;
}

function MentionEvent({ event }: { event: FeedEvent }) {
  const m = event.metadata as MentionEventMeta | undefined;
  const fromUser = event.user_name ?? m?.from_user ?? null;
  const trackName = m?.track_name ?? null;
  const artistName = m?.artist_name ?? null;
  const recordingMbid = m?.recording_mbid ?? null;
  const blurb = m?.blurb ?? "";
  return (
    <EventShell
      icon={<MessageSquareQuote className="size-4" />}
      header={
        <>
          <UserLink name={fromUser} /> mentioned you in a pin
          <span className="text-muted-foreground/70">
            {" · "}
            <RelativeTime value={event.created} />
          </span>
        </>
      }
    >
      {trackName && artistName && (
        <p className="text-muted-foreground mt-1 text-xs">
          on{" "}
          <Link
            href={recordingHref({
              mbid: recordingMbid,
              artist: artistName,
              title: trackName,
            })}
            className="text-foreground/90 hover:underline"
          >
            {trackName}
          </Link>{" "}
          by{" "}
          <Link
            href={artistHref({ mbid: null, name: artistName })}
            className="text-foreground/90 hover:underline"
          >
            {artistName}
          </Link>
        </p>
      )}
      {blurb && (
        <p className="text-foreground/80 mt-2 text-sm leading-5 italic">
          “<MentionText text={blurb} />”
        </p>
      )}
    </EventShell>
  );
}

function NotificationEvent({ event }: { event: FeedEvent }) {
  const m = event.metadata as NotificationMeta | undefined;
  // Notifications come back with embedded HTML (links to LB pages).
  // Strip tags to keep us out of the dangerouslySetInnerHTML business —
  // the cleaned text is still informative and the user can click
  // through to LB if they need the original link.
  const text = m?.message ? stripHtml(m.message) : "";
  return (
    <EventShell
      icon={<Bell className="size-4" />}
      header={
        <>
          {event.user_name ? (
            <>
              <UserLink name={event.user_name} />
              {" · "}
            </>
          ) : null}
          <RelativeTime value={event.created} />
        </>
      }
    >
      {/* Match the rhythm of other event bodies: same text-foreground/80
          tone + leading as pin/rec blurbs and review snippets, so a
          notification card sits at the same visual weight as
          everything else in the feed instead of dominating with a
          full-strength text-foreground sentence. */}
      <p className="text-foreground/80 mt-2 text-sm leading-5">{text}</p>
    </EventShell>
  );
}

// ─── List ───────────────────────────────────────────────────────────

/**
 * Pre-resolve cover-art URLs + entity names for every CritiqueBrainz
 * review in the batch so the renderer can show a thumbnail and the
 * actual entity name ("X reviewed *Sgt. Pepper's*") instead of the
 * fallback "an entity" label.
 *
 * Cover-art resolution:
 *   - release_group reviews map directly to a CAA URL (no fetch).
 *   - recording reviews need a single LB metadata batch call to
 *     learn the recording's release-group + CAA hints.
 *   - artist reviews don't get a cover slot.
 *
 * Name resolution:
 *   - recording reviews get the name + artist credit free from the
 *     same LB metadata batch we already do for covers.
 *   - release_group + artist reviews need bounded parallel MB calls.
 *     Capped at NAME_LOOKUP_CAP to keep first-paint latency sane on
 *     feeds with many reviews. MB calls beyond the cap are skipped;
 *     those events render with the "an entity" fallback as before.
 *
 * Result is one map keyed by entity_id with `{ coverUrl?, name? }`
 * so the dispatch case can look up both in one read.
 */
const NAME_LOOKUP_CAP = 8;

export interface ReviewEntityResolution {
  coverUrl?: string;
  name?: string;
}

async function resolveReviewEntities(
  events: FeedEvent[],
): Promise<Map<string, ReviewEntityResolution>> {
  const out = new Map<string, ReviewEntityResolution>();
  const recordingIds = new Set<string>();
  const releaseGroupIds = new Set<string>();
  const artistIds = new Set<string>();

  for (const e of events) {
    if (!isReviewEvent(e)) continue;
    const m = e.metadata as ReviewMeta | undefined;
    const id = m?.entity_id;
    if (!id) continue;
    // Prefer the entity_name LB ships natively when present — it
    // saves a per-entity MB call. Synthetic events from our CB
    // fan-out (`lib/review-events.ts`) don't include the name, so
    // those need the lookup below.
    const nativeName = m?.entity_name?.trim() || undefined;
    if (nativeName) {
      out.set(id, { ...(out.get(id) ?? {}), name: nativeName });
    }
    if (m?.entity_type === "release_group") {
      out.set(id, {
        ...(out.get(id) ?? {}),
        coverUrl: caaReleaseGroupUrl(id, 250),
      });
      if (!nativeName) releaseGroupIds.add(id);
    } else if (m?.entity_type === "recording") {
      recordingIds.add(id);
    } else if (m?.entity_type === "artist") {
      if (!nativeName) artistIds.add(id);
    }
  }

  // Recordings: one LB metadata batch call covers both cover-art
  // hints and the recording + artist names.
  if (recordingIds.size > 0) {
    let metadata;
    try {
      metadata = await getRecordingMetadata(Array.from(recordingIds));
    } catch {
      metadata = null;
    }
    if (metadata) {
      for (const id of recordingIds) {
        const entry = metadata.get(id);
        const r = entry?.release;
        let coverUrl: string | undefined;
        if (r?.caa_release_mbid && r.caa_id) {
          coverUrl = `https://archive.org/download/mbid-${r.caa_release_mbid}/mbid-${r.caa_release_mbid}-${r.caa_id}_thumb250.jpg`;
        } else if (r?.release_group_mbid) {
          coverUrl = caaReleaseGroupUrl(r.release_group_mbid, 250);
        } else if (r?.mbid) {
          coverUrl = `https://coverartarchive.org/release/${r.mbid}/front-250`;
        }
        const name = entry?.recording?.name?.trim();
        const merged: ReviewEntityResolution = { ...(out.get(id) ?? {}) };
        if (coverUrl) merged.coverUrl = coverUrl;
        if (name && !merged.name) merged.name = name;
        out.set(id, merged);
      }
    }
  }

  // Release-group + artist names: bounded parallel MB calls. MB's
  // 1 req/sec rate limiter queues these inside `mbFetch`, so capping
  // at NAME_LOOKUP_CAP keeps the worst-case first-paint cost ~8s
  // (and steady-state cost zero, thanks to the 24h MB tag cache).
  // Events that hit the cap render with the metadata-supplied or
  // "an entity" fallback name — link target is still correct.
  const rgsToLookup = Array.from(releaseGroupIds).slice(0, NAME_LOOKUP_CAP);
  const remaining = Math.max(0, NAME_LOOKUP_CAP - rgsToLookup.length);
  const artistsToLookup = Array.from(artistIds).slice(0, remaining);

  await Promise.all([
    ...rgsToLookup.map(async (id) => {
      try {
        const rg = await getReleaseGroup(id);
        const merged: ReviewEntityResolution = { ...(out.get(id) ?? {}) };
        if (rg?.title && !merged.name) merged.name = rg.title;
        out.set(id, merged);
      } catch {
        // best-effort — the renderer's fallback name handles this.
      }
    }),
    ...artistsToLookup.map(async (id) => {
      try {
        const a = await getArtist(id);
        const merged: ReviewEntityResolution = { ...(out.get(id) ?? {}) };
        if (a?.name && !merged.name) merged.name = a.name;
        out.set(id, merged);
      } catch {
        // ditto
      }
    }),
  ]);

  return out;
}

export async function FeedEventList({
  events,
  viewer = null,
}: {
  events: FeedEvent[];
  /** Pass the signed-in user's MB username so we can hide the Thanks
   *  button on their own pins / recs (LB returns 403 in that case). */
  viewer?: string | null;
}) {
  if (events.length === 0) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        Nothing in your feed yet — follow some listeners to see what they pin
        and discover.
      </p>
    );
  }
  const reviewEntities = await resolveReviewEntities(events);
  return (
    <ul className="border-border/60 divide-border/60 divide-y rounded-xl border px-4">
      {events.map((e, i) => {
        const key = `${e.id ?? "x"}-${e.created}-${i}`;
        switch (e.event_type) {
          case "recording_pin":
            return <PinEvent event={e} viewer={viewer} key={key} />;
          case "listen":
            return <ListenEvent event={e} viewer={viewer} key={key} />;
          case "loved_recording":
            return <LovedRecordingEvent event={e} viewer={viewer} key={key} />;
          case "recording_recommendation":
            return (
              <RecordingRecommendationEvent
                event={e}
                viewer={viewer}
                key={key}
              />
            );
          case "personal_recording_recommendation":
            return (
              <PersonalRecommendationEvent
                event={e}
                viewer={viewer}
                key={key}
              />
            );
          case "review":
          case "critiquebrainz_review": {
            const m = e.metadata as ReviewMeta | undefined;
            const resolved = m?.entity_id
              ? reviewEntities.get(m.entity_id)
              : undefined;
            return (
              <CritiqueBrainzReviewEvent
                event={e}
                coverUrl={resolved?.coverUrl ?? null}
                entityName={resolved?.name ?? null}
                key={key}
              />
            );
          }
          case "thanks":
            return <ThanksEvent event={e} key={key} />;
          case "follow":
            return <FollowEvent event={e} key={key} />;
          case "notification":
            return <NotificationEvent event={e} key={key} />;
          case "bsky_friend_linked":
            return <BskyFriendLinkedEvent event={e} key={key} />;
          case "mention":
            return <MentionEvent event={e} key={key} />;
          case "listen_along":
            return (
              <ListenAlongEvent event={e} viewer={viewer} key={key} />
            );
          case "playlist_published":
            return <PlaylistPublishedEvent event={e} key={key} />;
          default:
            return null; // unknown event types — quietly skip
        }
      })}
    </ul>
  );
}
