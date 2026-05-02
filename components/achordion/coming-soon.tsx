import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface ComingSoonProps {
  title?: string;
  description?: ReactNode;
  hint?: ReactNode;
  className?: string;
}

export function ComingSoon({
  title = "Coming soon",
  description = "This page is part of the Phase 1 route skeleton — it will get real ListenBrainz data in a later phase.",
  hint,
  className,
}: ComingSoonProps) {
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
