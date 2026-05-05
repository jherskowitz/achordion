"use client";

import { useState } from "react";
import { Heart, ListPlus, MoreVertical, Pin } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { feedbackTrackAction } from "@/app/(app)/track/actions";
import { parachordQueueAdd } from "@/lib/parachord";
import { useLoved } from "./loved-tracks-provider";
import { PinTrackDialog } from "./track-actions/pin-track-dialog";

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
}: {
  track: TrackRef;
  viewer: { mbUsername: string } | null;
}) {
  const [pinOpen, setPinOpen] = useState(false);
  if (!viewer) return null;
  const canPin = !!(track.recordingMbid || track.recordingMsid);
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
        </DropdownMenuContent>
      </DropdownMenu>
      <PinTrackDialog open={pinOpen} onOpenChange={setPinOpen} track={track} />
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
