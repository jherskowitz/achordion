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
  Star,
} from "lucide-react";
import { CoverArt } from "./cover-art";
import { ThanksButton } from "./thanks-button";
import { caaUrlFromListen } from "@/lib/clients/coverart";
import { parachordPlayTrack } from "@/lib/parachord";
import {
  artistHref,
  recordingHref,
  releaseGroupHref,
} from "@/lib/entity-links";
import type { FeedEvent } from "@/lib/clients/listenbrainz";

function relativeTime(unixSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSeconds;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  const date = new Date(unixSeconds * 1000);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year:
      Math.floor(Date.now() / 1000) - unixSeconds > 86400 * 365
        ? "numeric"
        : undefined,
  });
}

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
            “{blurb}”
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
    <li className="flex items-start gap-3 py-3">
      <div className="bg-muted/60 mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-muted-foreground text-xs">{header}</p>
          {trailing}
        </div>
        {children}
      </div>
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
            {relativeTime(event.created)}
          </span>
        </>
      }
      trailing={
        canThank ? (
          <ThanksButton
            originalEventType="recording_pin"
            originalEventId={event.id as number}
            size="compact"
          />
        ) : null
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

function ListenEvent({ event }: { event: FeedEvent }) {
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
            {relativeTime(when)}
          </span>
        </>
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
            {relativeTime(event.created)}
          </span>
        </>
      }
      trailing={
        canThank ? (
          <ThanksButton
            originalEventType="recording_recommendation"
            originalEventId={event.id as number}
            size="compact"
          />
        ) : null
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
            {relativeTime(event.created)}
          </span>
        </>
      }
      trailing={
        canThank ? (
          <ThanksButton
            originalEventType="personal_recording_recommendation"
            originalEventId={event.id as number}
            size="compact"
          />
        ) : null
      }
    >
      <TrackEventBody trackMeta={m?.track_metadata} blurb={m?.blurb_content} />
    </EventShell>
  );
}

// ─── critiquebrainz_review ──────────────────────────────────────────

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

function CritiqueBrainzReviewEvent({ event }: { event: FeedEvent }) {
  const m = event.metadata as ReviewMeta | undefined;
  const entityName = m?.entity_name ?? "an entity";
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
            {relativeTime(event.created)}
          </span>
        </>
      }
    >
      {(rating !== null || snippet) && (
        <div className="mt-2 space-y-1.5">
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
      )}
    </EventShell>
  );
}

// ─── thanks ─────────────────────────────────────────────────────────

interface ThanksMeta {
  thanker_username?: string;
  thankee_username?: string;
  blurb_content?: string | null;
  original_event_type?: string;
}

const ORIGINAL_LABEL: Record<string, string> = {
  recording_pin: "pin",
  recording_recommendation: "recommendation",
  personal_recording_recommendation: "personal recommendation",
};

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
            {relativeTime(event.created)}
          </span>
        </>
      }
    >
      {m?.blurb_content && (
        <p className="text-foreground/80 mt-1.5 text-sm leading-5 italic">
          “{m.blurb_content}”
        </p>
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
        <>
          <UserLink name={m?.user_name_0} />{" "}
          <span className="text-muted-foreground">started following</span>{" "}
          <UserLink name={m?.user_name_1} />
          <span className="text-muted-foreground/70">
            {" · "}
            {relativeTime(event.created)}
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
          {relativeTime(event.created)}
        </>
      }
    >
      <p className="mt-1 text-sm leading-5">{text}</p>
    </EventShell>
  );
}

// ─── List ───────────────────────────────────────────────────────────

export function FeedEventList({
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
  return (
    <ul className="border-border/60 divide-border/60 divide-y rounded-xl border px-4">
      {events.map((e, i) => {
        const key = `${e.id ?? "x"}-${e.created}-${i}`;
        switch (e.event_type) {
          case "recording_pin":
            return <PinEvent event={e} viewer={viewer} key={key} />;
          case "listen":
            return <ListenEvent event={e} key={key} />;
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
          case "critiquebrainz_review":
            return <CritiqueBrainzReviewEvent event={e} key={key} />;
          case "thanks":
            return <ThanksEvent event={e} key={key} />;
          case "follow":
            return <FollowEvent event={e} key={key} />;
          case "notification":
            return <NotificationEvent event={e} key={key} />;
          default:
            return null; // unknown event types — quietly skip
        }
      })}
    </ul>
  );
}
