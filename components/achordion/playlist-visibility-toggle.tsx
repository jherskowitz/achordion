"use client";

import { useState, useTransition } from "react";
import { Globe, Loader2, Lock } from "lucide-react";
import { setPlaylistVisibilityAction } from "@/app/(app)/playlist/[mbid]/actions";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { cn } from "@/lib/utils";

/**
 * Owner-only toggle for switching a playlist between public and
 * private. Renders nothing for non-owners — server-side ownership
 * check in the action is the actual authority; this is a UX hint.
 *
 * Optimistic update: flips the local state immediately, reverts on
 * server error. The action also revalidates the playlist + user
 * playlists tags so a subsequent navigation paints the new state.
 */
export function PlaylistVisibilityToggle({
  mbid,
  initialIsPublic,
}: {
  mbid: string;
  initialIsPublic: boolean;
}) {
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function flip() {
    const next = !isPublic;
    setIsPublic(next); // optimistic
    setError(null);
    startTransition(async () => {
      const result = await setPlaylistVisibilityAction(mbid, next);
      if (!result.ok) {
        setIsPublic(!next); // revert
        setError(result.reason);
      }
    });
  }

  const Icon = pending ? Loader2 : isPublic ? Globe : Lock;
  const label = isPublic ? "Public" : "Private";
  const title = isPublic
    ? "Public — visible to anyone with the link. Click to make private."
    : "Private — only you can see this. Click to make public.";

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <IconTooltip label={title}>
        <button
          type="button"
          onClick={flip}
          disabled={pending}
          aria-label={title}
          className={cn(
            "border-border/60 hover:border-foreground/40 hover:bg-muted/40 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] tracking-wide uppercase transition-colors disabled:opacity-60",
            isPublic
              ? "text-muted-foreground"
              : "text-foreground bg-muted/30",
          )}
        >
          <Icon
            className={cn("size-3", pending && "animate-spin")}
          />
          {label}
        </button>
      </IconTooltip>
      {error && (
        <span className="text-destructive text-[11px]">{error}</span>
      )}
    </span>
  );
}
