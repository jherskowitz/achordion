"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createPlaylistAction } from "@/app/(app)/track/actions";

const NAME_MAX = 120;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordingMbid: string;
  onCreated?: (playlistMbid: string) => void;
};

/**
 * Modal that creates a new ListenBrainz playlist seeded with the
 * given recording. Defaults to public (matches the LB UX). On
 * success, invalidates the cached `["me","playlists"]` query so the
 * surrounding submenu picks the new playlist up the next time it
 * opens, fires `onCreated`, and closes.
 */
export function NewPlaylistDialog({
  open,
  onOpenChange,
  recordingMbid,
  onCreated,
}: Props) {
  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [pending, startTransition] = useTransition();
  const queryClient = useQueryClient();

  // Reset form whenever the dialog transitions from closed → open.
  // Tracking the previous `open` prop and calling setState during
  // render is React's recommended pattern for "derive state from
  // a prop change" — see https://react.dev/reference/react/useState#storing-information-from-previous-renders.
  // This avoids `react-hooks/set-state-in-effect` and the cascading
  // re-render that an effect-based reset would cause.
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setName("");
      setIsPublic(true);
    }
  }

  function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Playlist name is required.");
      return;
    }
    startTransition(async () => {
      const result = await createPlaylistAction({
        name: trimmed,
        isPublic,
        recordingMbid,
      });
      if (!result.ok) {
        toast.error(result.reason);
        return;
      }
      // Bump the cached playlists list so the submenu reflects the
      // newly-created entry without a hard refresh.
      void queryClient.invalidateQueries({ queryKey: ["me", "playlists"] });
      const playlistMbid = result.playlistMbid;
      toast.success(`Created "${trimmed}"`, {
        action: {
          label: "View",
          onClick: () => {
            window.location.href = `/playlist/${encodeURIComponent(playlistMbid)}`;
          },
        },
      });
      onCreated?.(playlistMbid);
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New playlist</DialogTitle>
          <DialogDescription>
            Adds the current track as the first entry.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="new-playlist-name"
              className="text-xs font-medium text-muted-foreground"
            >
              Name
            </label>
            <input
              id="new-playlist-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
              maxLength={NAME_MAX}
              placeholder="e.g. Late-night listens"
              autoFocus
              className="rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="size-4 rounded border-input"
            />
            <span>Public</span>
            <span className="text-xs text-muted-foreground">
              {isPublic
                ? "Visible on your profile."
                : "Only you can see it."}
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={pending || !name.trim()}
          >
            {pending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
