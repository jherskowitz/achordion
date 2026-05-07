import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Standard empty / placeholder card used wherever a section has no
 * data to render — "you haven't pinned anything yet", "no top tracks
 * for this range", "this feature is on the way", etc. Originally
 * called `<EmptyState>`; renamed because the visual was being reused
 * for any-empty-state and the old name kept nudging contributors to
 * roll their own markup for the non-coming-soon cases.
 *
 * Visual contract is unchanged: dashed-border card, centered icon
 * chip, title, description, optional hint footer. Default copy + the
 * Sparkles icon match the original "Coming soon" framing so existing
 * call sites that relied on the defaults keep rendering identically.
 */
interface EmptyStateProps {
  title?: string;
  description?: ReactNode;
  hint?: ReactNode;
  className?: string;
}

export function EmptyState({
  title = "Coming soon",
  description = "This page is part of the Phase 1 route skeleton — it will get real ListenBrainz data in a later phase.",
  hint,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "border-border/60 bg-muted/30 flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-20 text-center",
        className,
      )}
    >
      <div className="bg-background border-border/60 mb-5 flex size-12 items-center justify-center rounded-full border">
        <Sparkles className="text-muted-foreground size-5" />
      </div>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="text-muted-foreground mt-2 max-w-md text-sm leading-6">
        {description}
      </p>
      {hint && (
        <p className="text-muted-foreground/70 mt-4 max-w-md text-xs leading-5">
          {hint}
        </p>
      )}
    </div>
  );
}
