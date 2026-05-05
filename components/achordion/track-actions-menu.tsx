"use client";

import { useState } from "react";
import {
  Heart,
  ListPlus,
  ListMusic,
  Megaphone,
  MoreVertical,
  Pin,
  Plus,
  Trash2,
  Users,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  addToPlaylistAction,
  deleteListenAction,
  feedbackTrackAction,
  recommendTrackAction,
} from "@/app/(app)/track/actions";
import { parachordQueueAdd } from "@/lib/parachord";
import { useLoved } from "./loved-tracks-provider";
import { PinTrackDialog } from "./track-actions/pin-track-dialog";
import { ConfirmDialog } from "./track-actions/confirm-dialog";
import { NewPlaylistDialog } from "./track-actions/new-playlist-dialog";
import { RecommendDialog } from "./track-actions/recommend-dialog";

export type TrackRef = {
  recordingMbid?: string | null;
  recordingMsid?: string | null;
  trackName: string;
  artistName: string;
  releaseMbid?: string | null;
  // Listen-specific (only when this row is a real listen):
  listenedAt?: number;
  ownerUsername?: string;
};

/**
 * Track-level actions menu (⋮ icon) anchored to a row.
 *
 * Returns `null` for signed-out viewers — none of the actions in this
 * menu are meaningful without an mbUsername attached to the session,
 * so don't take up the row's right-edge slot at all.
 */
export function TrackActionsMenu({
  track,
  viewer,
  onDeleted,
}: {
  track: TrackRef;
  viewer: { mbUsername: string } | null;
  /**
   * Fired after a successful Delete-listen call. Consumers (e.g.
   * `LiveScrobbleList`) use this to optimistically drop the row from
   * local state so it disappears without waiting for a re-fetch.
   */
  onDeleted?: () => void;
}) {
  const [pinOpen, setPinOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newPlaylistOpen, setNewPlaylistOpen] = useState(false);
  const [recommendOpen, setRecommendOpen] = useState(false);
  if (!viewer) return null;
  const canPin = !!(track.recordingMbid || track.recordingMsid);
  const canPlaylist = !!track.recordingMbid;
  const canRecommend = !!track.recordingMbid;
  // Delete only makes sense for an actual listen owned by the viewer:
  // we need a recording_msid + listened_at to address the listen, and
  // the row's owner must be the signed-in user.
  const canDelete =
    !!track.listenedAt &&
    !!track.recordingMsid &&
    !!track.ownerUsername &&
    track.ownerUsername === viewer.mbUsername;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Track actions for ${track.trackName}`}
              className="text-muted-foreground/70 hover:text-foreground"
            >
              <MoreVertical className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Track</DropdownMenuLabel>
          <LoveItem track={track} />
          <PinItem disabled={!canPin} onSelect={() => setPinOpen(true)} />
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Add</DropdownMenuLabel>
          <QueueAddItem track={track} />
          <AddToPlaylistSub
            disabled={!canPlaylist}
            recordingMbid={track.recordingMbid ?? null}
            onCreateNew={() => setNewPlaylistOpen(true)}
          />
          <RecommendSub
            disabled={!canRecommend}
            recordingMbid={track.recordingMbid ?? null}
            onChoosePeople={() => setRecommendOpen(true)}
          />
          {canDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 />
                Delete listen…
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <PinTrackDialog open={pinOpen} onOpenChange={setPinOpen} track={track} />
      {canPlaylist ? (
        <NewPlaylistDialog
          open={newPlaylistOpen}
          onOpenChange={setNewPlaylistOpen}
          recordingMbid={track.recordingMbid!}
        />
      ) : null}
      {canRecommend ? (
        <RecommendDialog
          open={recommendOpen}
          onOpenChange={setRecommendOpen}
          track={track}
        />
      ) : null}
      {canDelete ? (
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title="Delete this listen?"
          body="This can't be undone."
          confirmLabel="Delete"
          destructive
          onConfirm={async () => {
            const result = await deleteListenAction({
              recordingMsid: track.recordingMsid!,
              listenedAt: track.listenedAt!,
            });
            if (!result.ok) {
              toast.error(result.reason);
              return;
            }
            onDeleted?.();
            toast.success("Listen deleted");
          }}
        />
      ) : null}
    </>
  );
}

/**
 * Pin menu item — opens the PinTrackDialog. Disabled when the track
 * is missing both recording_mbid and recording_msid (LB pin needs at
 * least one of those to identify the track).
 */
function PinItem({
  disabled,
  onSelect,
}: {
  disabled: boolean;
  onSelect: () => void;
}) {
  const item = (
    <DropdownMenuItem
      disabled={disabled}
      onClick={disabled ? undefined : onSelect}
    >
      <Pin />
      Pin track…
    </DropdownMenuItem>
  );
  if (!disabled) return item;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>{item}</span>
      </TooltipTrigger>
      <TooltipContent side="left">
        No MusicBrainz ID for this recording.
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Love / Unlove menu item.
 *
 * Optimistically flips the local loved-set, then calls the LB
 * feedback action. On failure, reverts the optimistic update and
 * surfaces the reason via a toast. On success, surfaces an Undo
 * affordance that re-fires the action with the previous score.
 *
 * Disabled when the row has no recording MBID, since LB feedback
 * is keyed on MBID. A tooltip explains why.
 */
function LoveItem({ track }: { track: TrackRef }) {
  const { isLoved, setLoved } = useLoved();
  const mbid = track.recordingMbid ?? null;
  const loved = isLoved(mbid);
  const disabled = !mbid;

  async function fire(targetMbid: string, score: 0 | 1, prevScore: 0 | 1) {
    setLoved(targetMbid, score);
    const result = await feedbackTrackAction({
      recordingMbid: targetMbid,
      score,
    });
    if (!result.ok) {
      setLoved(targetMbid, prevScore);
      toast.error(result.reason);
      return;
    }
    toast.success(score ? "Loved" : "Removed from loved", {
      action: {
        label: "Undo",
        onClick: () => {
          // Re-fire with the previous score; this itself reverts on failure.
          void fire(targetMbid, prevScore, score);
        },
      },
    });
  }

  function handleClick() {
    if (!mbid) return;
    const nextScore: 0 | 1 = loved ? 0 : 1;
    const prevScore: 0 | 1 = loved ? 1 : 0;
    void fire(mbid, nextScore, prevScore);
  }

  const item = (
    <DropdownMenuItem
      disabled={disabled}
      onClick={disabled ? undefined : handleClick}
    >
      <Heart
        className={loved ? "text-rose-500" : ""}
        fill={loved ? "currentColor" : "none"}
      />
      {loved ? "Unlove" : "Love track"}
    </DropdownMenuItem>
  );

  if (!disabled) return item;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>{item}</span>
      </TooltipTrigger>
      <TooltipContent side="left">
        No MusicBrainz ID for this recording.
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Send the track to a running Parachord via the `parachord://queue/add`
 * deep link. Uses the existing helper, so the URL shape stays in sync
 * with every other Parachord call site (artist+title, optional album).
 *
 * The protocol is fire-and-forget — we have no signal back from
 * Parachord — so the toast just confirms we sent the URL.
 */
function QueueAddItem({ track }: { track: TrackRef }) {
  function handleClick() {
    const url = parachordQueueAdd({
      artist: track.artistName,
      title: track.trackName,
    });
    if (typeof window !== "undefined") {
      window.location.href = url;
    }
    toast.success("Sent to Parachord");
  }
  return (
    <DropdownMenuItem onClick={handleClick}>
      <ListPlus />
      Add to Parachord queue
    </DropdownMenuItem>
  );
}

type PlaylistsResponse = {
  playlists: Array<{
    mbid: string;
    title: string;
    isPublic: boolean;
    lastModifiedAt: string;
  }>;
};

/**
 * Cascading "Add to playlist" submenu.
 *
 * Lazy-fetches the viewer's playlists via `/api/me/playlists` on
 * first sub-open (gated by React Query's `enabled` flag) so menus
 * that never expand pay zero network cost. Up to 10 most-recently-
 * modified playlists render as items; clicking one fires
 * `addToPlaylistAction` and optimistically marks the row as added so
 * the user gets immediate feedback even if the LB call is slow.
 */
function AddToPlaylistSub({
  disabled,
  recordingMbid,
  onCreateNew,
}: {
  disabled: boolean;
  recordingMbid: string | null;
  onCreateNew: () => void;
}) {
  const [subOpen, setSubOpen] = useState(false);
  // Tracks which playlists this open of the menu has already added
  // to, so we can render a checkmark and skip re-firing on a second
  // click. Optimistic — reverted by the toast on failure.
  const [addedMbids, setAddedMbids] = useState<Set<string>>(new Set());

  const query = useQuery<PlaylistsResponse>({
    queryKey: ["me", "playlists"],
    queryFn: async () => {
      const res = await fetch("/api/me/playlists");
      if (!res.ok && res.status !== 401) {
        throw new Error("Couldn't load playlists.");
      }
      return (await res.json()) as PlaylistsResponse;
    },
    enabled: subOpen && !disabled,
  });

  async function handleAdd(playlistMbid: string, title: string) {
    if (!recordingMbid) return;
    if (addedMbids.has(playlistMbid)) return;
    setAddedMbids((prev) => {
      const next = new Set(prev);
      next.add(playlistMbid);
      return next;
    });
    const result = await addToPlaylistAction({
      playlistMbid,
      recordingMbid,
    });
    if (!result.ok) {
      setAddedMbids((prev) => {
        const next = new Set(prev);
        next.delete(playlistMbid);
        return next;
      });
      toast.error(result.reason);
      return;
    }
    toast.success(`Added to ${title}`);
  }

  const trigger = (
    <DropdownMenuSubTrigger disabled={disabled}>
      <ListMusic />
      Add to playlist
    </DropdownMenuSubTrigger>
  );

  if (disabled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span>{trigger}</span>
        </TooltipTrigger>
        <TooltipContent side="left">
          No MusicBrainz ID for this recording.
        </TooltipContent>
      </Tooltip>
    );
  }

  // Sort by lastModifiedAt desc, take 10. The API already caps at 20,
  // but a smaller cap keeps the submenu compact — anyone needing more
  // can use the dedicated playlists page.
  const playlists = (query.data?.playlists ?? [])
    .slice()
    .sort((a, b) =>
      a.lastModifiedAt < b.lastModifiedAt
        ? 1
        : a.lastModifiedAt > b.lastModifiedAt
          ? -1
          : 0,
    )
    .slice(0, 10);

  return (
    <DropdownMenuSub open={subOpen} onOpenChange={setSubOpen}>
      {trigger}
      <DropdownMenuSubContent className="min-w-56">
        {query.isLoading ? (
          <div className="px-1.5 py-1 text-sm text-muted-foreground">
            Loading playlists…
          </div>
        ) : playlists.length === 0 ? (
          <div className="px-1.5 py-1 text-sm text-muted-foreground">
            No playlists yet. Create one ↓
          </div>
        ) : (
          playlists.map((p) => {
            const added = addedMbids.has(p.mbid);
            return (
              <DropdownMenuItem
                key={p.mbid}
                disabled={added}
                onClick={() => void handleAdd(p.mbid, p.title)}
              >
                <span className="truncate">{p.title}</span>
                {added ? (
                  <span className="ml-auto text-xs text-muted-foreground">
                    ✓
                  </span>
                ) : null}
              </DropdownMenuItem>
            );
          })
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onCreateNew}>
          <Plus />
          New playlist…
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

type FollowersResponse = { followers: string[] };

/**
 * "Recommend" cascading submenu.
 *
 * Two paths: a one-tap "All followers" item that resolves the
 * follower list on demand (via `queryClient.fetchQuery`, sharing the
 * `["me","followers"]` cache with the picker dialog), and a
 * "Choose people…" item that opens the full picker. The submenu's
 * own `enabled`-gated query primes the cache when the user just
 * hovers, so by the time they pick "All followers" the list is
 * usually already in memory.
 */
function RecommendSub({
  disabled,
  recordingMbid,
  onChoosePeople,
}: {
  disabled: boolean;
  recordingMbid: string | null;
  onChoosePeople: () => void;
}) {
  const [subOpen, setSubOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const queryClient = useQueryClient();

  const query = useQuery<FollowersResponse>({
    queryKey: ["me", "followers"],
    queryFn: async () => {
      const res = await fetch("/api/me/followers");
      if (!res.ok && res.status !== 401) {
        throw new Error("Couldn't load followers.");
      }
      return (await res.json()) as FollowersResponse;
    },
    enabled: subOpen && !disabled,
  });

  async function handleAllFollowers() {
    if (!recordingMbid) return;
    setSending(true);
    try {
      // Use whatever the cache already has if the user hovered first;
      // otherwise this kicks off a fetch and waits.
      const data = await queryClient.fetchQuery<FollowersResponse>({
        queryKey: ["me", "followers"],
        queryFn: async () => {
          const res = await fetch("/api/me/followers");
          if (!res.ok && res.status !== 401) {
            throw new Error("Couldn't load followers.");
          }
          return (await res.json()) as FollowersResponse;
        },
      });
      const recipients = data.followers;
      if (recipients.length === 0) {
        toast.error("No followers to recommend to.");
        return;
      }
      // Server caps at 50; surface the limit instead of silently
      // truncating so the viewer can opt into the picker if they
      // really need to send to a larger group.
      if (recipients.length > 50) {
        toast.error(
          `You have ${recipients.length} followers; pick up to 50 via Choose people…`,
        );
        return;
      }
      const result = await recommendTrackAction({
        recordingMbid,
        recipients,
      });
      if (!result.ok) {
        toast.error(result.reason);
        return;
      }
      toast.success(
        `Recommended to ${recipients.length} follower${
          recipients.length === 1 ? "" : "s"
        }`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't load followers.",
      );
    } finally {
      setSending(false);
    }
  }

  const trigger = (
    <DropdownMenuSubTrigger disabled={disabled}>
      <Megaphone />
      Recommend
    </DropdownMenuSubTrigger>
  );

  if (disabled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span>{trigger}</span>
        </TooltipTrigger>
        <TooltipContent side="left">
          No MusicBrainz ID for this recording.
        </TooltipContent>
      </Tooltip>
    );
  }

  const followerCount = query.data?.followers.length ?? null;

  return (
    <DropdownMenuSub open={subOpen} onOpenChange={setSubOpen}>
      {trigger}
      <DropdownMenuSubContent className="min-w-56">
        <DropdownMenuItem
          disabled={sending || query.isLoading}
          onClick={() => void handleAllFollowers()}
        >
          <Users />
          {sending
            ? "Sending…"
            : query.isLoading
              ? "All followers (loading…)"
              : followerCount !== null
                ? `All followers (${followerCount})`
                : "All followers"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onChoosePeople}>
          <UserPlus />
          Choose people…
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
