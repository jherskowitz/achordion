"use client";

import { useState, useTransition } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { pinTrackAction } from "@/app/(app)/track/actions";
import type { TrackRef } from "../track-actions-menu";

const BLURB_MAX = 240;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  track: TrackRef;
};

/**
 * Modal that collects the optional blurb + pinned-until date, then
 * fires `pinTrackAction`. Disables the Pin button while the action is
 * in flight via `useTransition`. Resets local state whenever the
 * dialog opens so a previous attempt's blurb doesn't leak in.
 */
export function PinTrackDialog({ open, onOpenChange, track }: Props) {
  const [blurb, setBlurb] = useState("");
  const [pinnedUntil, setPinnedUntil] = useState("");
  const [pending, startTransition] = useTransition();
  const { data: session } = useSession();
  const viewerName = session?.user?.mbUsername;

  // Clear inputs every time the dialog (re)opens. We don't try to
  // preserve drafts across opens — the blurb is short and tied to a
  // specific track + moment. Track the previous `open` prop and
  // reset during render rather than in an effect, per React's
  // recommended pattern for prop-derived state.
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setBlurb("");
      setPinnedUntil("");
    }
  }

  function handleSubmit() {
    const blurbTrimmed = blurb.trim();
    let pinnedUntilUnix: number | undefined;
    if (pinnedUntil) {
      const ms = Date.parse(pinnedUntil);
      if (!Number.isNaN(ms)) {
        pinnedUntilUnix = Math.floor(ms / 1000);
      }
    }

    startTransition(async () => {
      const result = await pinTrackAction({
        recordingMbid: track.recordingMbid ?? undefined,
        recordingMsid: track.recordingMsid ?? undefined,
        blurb: blurbTrimmed || undefined,
        pinnedUntil: pinnedUntilUnix,
      });
      if (!result.ok) {
        toast.error(result.reason);
        return;
      }
      const action = viewerName
        ? {
            label: "View",
            onClick: () => {
              window.location.href = `/user/${encodeURIComponent(viewerName)}`;
            },
          }
        : undefined;
      toast.success("Pinned to your profile", action ? { action } : undefined);
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pin this track to your profile</DialogTitle>
          <DialogDescription>
            {track.trackName}
            <span className="text-muted-foreground"> — {track.artistName}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="pin-blurb"
              className="text-xs font-medium text-muted-foreground"
            >
              Note (optional)
            </label>
            <textarea
              id="pin-blurb"
              value={blurb}
              onChange={(e) => setBlurb(e.target.value.slice(0, BLURB_MAX))}
              maxLength={BLURB_MAX}
              rows={3}
              placeholder="Why this track? (visible on your profile)"
              className="resize-none rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="self-end text-xs text-muted-foreground tabular-nums">
              {blurb.length}/{BLURB_MAX}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="pin-until"
              className="text-xs font-medium text-muted-foreground"
            >
              Unpin on (optional)
            </label>
            <input
              id="pin-until"
              type="date"
              value={pinnedUntil}
              onChange={(e) => setPinnedUntil(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={pending}>
            {pending ? "Pinning…" : "Pin"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
