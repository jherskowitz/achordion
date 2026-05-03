import Link from "next/link";
import { Pin, Play, UserPlus, Bell } from "lucide-react";
import { CoverArt } from "./cover-art";
import { caaUrlFromListen } from "@/lib/clients/coverart";
import { parachordPlayTrack } from "@/lib/parachord";
import { artistHref, recordingHref } from "@/lib/entity-links";
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
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface PinTrackMeta {
  track_metadata?: {
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
  };
  blurb_content?: string | null;
}

function PinEvent({ event }: { event: FeedEvent }) {
  const m = event.metadata as PinTrackMeta | undefined;
  const tm = m?.track_metadata;
  const trackName = tm?.track_name ?? "Unknown track";
  const artistName = tm?.artist_name ?? "Unknown artist";
  const recordingMbid =
    tm?.mbid_mapping?.recording_mbid ??
    tm?.additional_info?.recording_mbid ??
    null;
  const artistMbid =
    tm?.mbid_mapping?.artist_mbids?.[0] ??
    tm?.additional_info?.artist_mbids?.[0] ??
    null;
  const cover = tm
    ? caaUrlFromListen(
        {
          additional_info: tm.additional_info
            ? {
                release_mbid: tm.additional_info.release_mbid ?? undefined,
              }
            : undefined,
          mbid_mapping: tm.mbid_mapping
            ? {
                release_mbid: tm.mbid_mapping.release_mbid ?? undefined,
                caa_id: tm.mbid_mapping.caa_id ?? undefined,
                caa_release_mbid:
                  tm.mbid_mapping.caa_release_mbid ?? undefined,
              }
            : undefined,
        },
        250,
      )
    : null;
  const who = event.user_name;
  return (
    <li className="flex items-start gap-3 py-3">
      <div className="bg-muted/60 mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full">
        <Pin className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground text-xs">
          {who ? (
            <Link
              href={`/user/${encodeURIComponent(who)}`}
              className="text-foreground hover:underline"
            >
              {who}
            </Link>
          ) : (
            "Someone"
          )}{" "}
          pinned a track
          <span className="text-muted-foreground/70">
            {" · "}
            {relativeTime(event.created)}
          </span>
        </p>
        <div className="mt-2 flex items-start gap-3">
          <a
            href={parachordPlayTrack({
              artist: artistName,
              title: trackName,
            })}
            aria-label={`Play "${trackName}" by ${artistName} in Parachord`}
            title={`Play in Parachord`}
            className="group/cover relative shrink-0 overflow-hidden rounded-md"
          >
            <CoverArt src={cover} alt={trackName} size={48} />
            <span
              aria-hidden
              className="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 transition-opacity group-hover/cover:opacity-100"
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
            {m?.blurb_content && (
              <p className="text-foreground/80 mt-1.5 text-sm leading-5 italic">
                “{m.blurb_content}”
              </p>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

interface FollowMeta {
  user_name_0?: string;
  user_name_1?: string;
  relationship_type?: string;
}

function FollowEvent({ event }: { event: FeedEvent }) {
  const m = event.metadata as FollowMeta | undefined;
  const a = m?.user_name_0;
  const b = m?.user_name_1;
  return (
    <li className="flex items-start gap-3 py-3">
      <div className="bg-muted/60 mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full">
        <UserPlus className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          {a ? (
            <Link
              href={`/user/${encodeURIComponent(a)}`}
              className="font-medium hover:underline"
            >
              {a}
            </Link>
          ) : (
            <span className="font-medium">Someone</span>
          )}{" "}
          <span className="text-muted-foreground">started following</span>{" "}
          {b ? (
            <Link
              href={`/user/${encodeURIComponent(b)}`}
              className="font-medium hover:underline"
            >
              {b}
            </Link>
          ) : (
            <span className="font-medium">someone</span>
          )}
        </p>
        <p className="text-muted-foreground/70 text-xs">
          {relativeTime(event.created)}
        </p>
      </div>
    </li>
  );
}

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
    <li className="flex items-start gap-3 py-3">
      <div className="bg-muted/60 mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full">
        <Bell className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-5">{text}</p>
        <p className="text-muted-foreground/70 text-xs">
          {event.user_name ? `${event.user_name} · ` : ""}
          {relativeTime(event.created)}
        </p>
      </div>
    </li>
  );
}

export function FeedEventList({ events }: { events: FeedEvent[] }) {
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
            return <PinEvent event={e} key={key} />;
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
