"use client";

import { MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
 * Phase 1: shell only — renders a single disabled "Test item" so we
 * can prove the trigger and popup wire up correctly across the call
 * sites we care about (scrobble rows, top-track tiles, etc.) before
 * we layer real actions (love / unlove, pin, queue-in-Parachord,
 * delete-listen, …) on top in a follow-up.
 *
 * Returns `null` for signed-out viewers — none of the upcoming
 * actions are meaningful without an mbUsername attached to the
 * session, so don't take up the row's right-edge slot at all.
 */
export function TrackActionsMenu({
  track,
  viewer,
}: {
  track: TrackRef;
  viewer: { mbUsername: string } | null;
}) {
  if (!viewer) return null;
  return (
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
        <DropdownMenuItem disabled>Test item</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
