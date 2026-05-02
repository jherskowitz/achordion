"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, UserPlus, UserMinus } from "lucide-react";
import {
  followUserAction,
  unfollowUserAction,
} from "@/app/(app)/user/[name]/actions";
import { cn } from "@/lib/utils";

interface FollowToggleProps {
  target: string;
  initiallyFollowing: boolean;
  /** Reason the toggle is disabled, if any (e.g. no LB token configured). */
  disabledReason?: string;
}

export function FollowToggle({
  target,
  initiallyFollowing,
  disabledReason,
}: FollowToggleProps) {
  const [following, setFollowing] = useState(initiallyFollowing);
  const [hover, setHover] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const disabled = pending || Boolean(disabledReason);

  function onClick() {
    if (disabled) return;
    setError(null);
    const wasFollowing = following;
    // Optimistic flip
    setFollowing(!wasFollowing);
    startTransition(async () => {
      const result = wasFollowing
        ? await unfollowUserAction(target)
        : await followUserAction(target);
      if (!result.ok) {
        setFollowing(wasFollowing);
        setError(result.reason);
      } else {
        router.refresh();
      }
    });
  }

  let label: string;
  let Icon = UserPlus;
  let style: "filled" | "outline" = "filled";
  if (following) {
    if (hover) {
      label = "Unfollow";
      Icon = UserMinus;
    } else {
      label = "Following";
      Icon = Check;
    }
    style = "outline";
  } else {
    label = "Follow";
    Icon = UserPlus;
    style = "filled";
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        disabled={disabled}
        title={disabledReason}
        aria-pressed={following}
        className={cn(
          "inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          style === "filled"
            ? "bg-primary text-primary-foreground hover:opacity-90"
            : "border-border/60 text-foreground hover:border-destructive/50 hover:text-destructive border bg-transparent",
        )}
      >
        <Icon className="size-3.5" />
        {label}
      </button>
      {error && (
        <p className="text-destructive max-w-[220px] text-right text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
