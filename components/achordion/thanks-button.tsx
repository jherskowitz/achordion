"use client";

import { useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { thanksAction } from "@/app/(app)/feed/actions";
import { cn } from "@/lib/utils";

/**
 * Lightweight "Thanks" button that fires
 * `POST /user/<viewer>/timeline-event/create/thanks` against LB.
 * Optimistic-on-success: button shows "Thanked" with a filled heart
 * once the action returns ok. Failure surfaces a tooltip with the
 * LB-provided reason — most often "you don't follow this user, so
 * can't thank their event" which is a real LB constraint.
 *
 * Two thankable contexts in Achordion:
 *   - Feed cards for `recording_pin` (someone else's pin),
 *     `recording_recommendation`, and `personal_recording_recommendation`.
 *   - Pinned-track cards on user profile pages (when the viewer isn't
 *     the profile owner).
 *
 * Caller is responsible for not rendering this on the viewer's own
 * events — LB returns 403 in that case and we'd just be showing a
 * button that never works.
 */
export function ThanksButton({
  originalEventType,
  originalEventId,
  size = "default",
  className,
}: {
  originalEventType:
    | "recording_pin"
    | "recording_recommendation"
    | "personal_recording_recommendation";
  originalEventId: number;
  /** "compact" → smaller version for inline placement on cards. */
  size?: "default" | "compact";
  className?: string;
}) {
  const [thanked, setThanked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function go() {
    if (thanked || pending) return;
    setError(null);
    start(async () => {
      const r = await thanksAction({ originalEventType, originalEventId });
      if (r.ok) setThanked(true);
      else setError(r.reason);
    });
  }

  const compact = size === "compact";

  return (
    <button
      type="button"
      onClick={go}
      disabled={pending || thanked}
      title={error ?? (thanked ? "Thanked" : "Thank")}
      aria-label={thanked ? "Thanked" : "Thank"}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border font-medium transition-colors",
        compact ? "h-6 px-2 text-[10px]" : "h-7 px-2.5 text-xs",
        thanked
          ? "border-rose-500/40 text-rose-500"
          : "border-border/60 text-muted-foreground hover:border-foreground/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    >
      <Heart
        className={cn(
          compact ? "size-2.5" : "size-3",
          thanked && "fill-current",
        )}
      />
      {thanked ? "Thanked" : "Thanks"}
    </button>
  );
}
