"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { recommendTrackAction } from "@/app/(app)/track/actions";
import type { TrackRef } from "../track-actions-menu";

const MAX_RECIPIENTS = 50;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  track: TrackRef;
};

type FollowersResponse = { followers: string[] };

/**
 * Picker dialog for the Recommend submenu's "Choose people…" path.
 *
 * Loads the viewer's followers via React Query (cached under
 * `["me", "followers"]` so it shares state with any future surfaces
 * needing the same list), filters them client-side via a free-text
 * search, and lets the viewer toggle each as a checkbox row. The
 * Send button enforces 1–50 recipients to match the server-side
 * cap in `recommendTrackAction`.
 */
export function RecommendDialog({ open, onOpenChange, track }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [pending, startTransition] = useTransition();

  // Reset every time the dialog reopens so a previous attempt's
  // selection doesn't carry over to a different track.
  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setFilter("");
    }
  }, [open]);

  const query = useQuery<FollowersResponse>({
    queryKey: ["me", "followers"],
    queryFn: async () => {
      const res = await fetch("/api/me/followers");
      if (!res.ok && res.status !== 401) {
        throw new Error("Couldn't load followers.");
      }
      return (await res.json()) as FollowersResponse;
    },
    enabled: open,
  });

  const allFollowers = query.data?.followers ?? [];
  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return allFollowers;
    return allFollowers.filter((u) => u.toLowerCase().includes(q));
  }, [allFollowers, filter]);

  function toggle(username: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(username)) {
        next.delete(username);
      } else {
        next.add(username);
      }
      return next;
    });
  }

  const count = selected.size;
  const canSend =
    !!track.recordingMbid && count > 0 && count <= MAX_RECIPIENTS;

  function handleSend() {
    if (!track.recordingMbid) return;
    if (!canSend) return;
    const recipients = Array.from(selected);
    startTransition(async () => {
      const result = await recommendTrackAction({
        recordingMbid: track.recordingMbid!,
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
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Recommend <em className="not-italic font-semibold">{track.trackName}</em>{" "}
            <span className="text-muted-foreground">by {track.artistName}</span>
          </DialogTitle>
          <DialogDescription>
            Pick the followers who should see this in their personalised
            feed.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search followers…"
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          />

          <div className="max-h-72 overflow-y-auto rounded-md border border-input">
            {query.isLoading ? (
              <div className="px-3 py-4 text-sm text-muted-foreground">
                Loading followers…
              </div>
            ) : allFollowers.length === 0 ? (
              <div className="px-3 py-4 text-sm text-muted-foreground">
                No followers yet.
              </div>
            ) : visible.length === 0 ? (
              <div className="px-3 py-4 text-sm text-muted-foreground">
                No matches.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {visible.map((username) => {
                  const checked = selected.has(username);
                  return (
                    <li key={username}>
                      <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(username)}
                          className="size-4 rounded border-input"
                        />
                        <span className="truncate">{username}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {count} selected
              {count > MAX_RECIPIENTS ? ` (max ${MAX_RECIPIENTS})` : ""}
            </span>
            {count > 0 ? (
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-xs underline-offset-2 hover:underline"
              >
                Clear
              </button>
            ) : null}
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
          <Button onClick={handleSend} disabled={pending || !canSend}>
            {pending ? "Sending…" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
