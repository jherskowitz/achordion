"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Two-or-three-option pill switch — segmented control rendered as a
 * single rounded-full container with each option styled as an inline
 * pill. Active option gets a white-ish elevated cell; inactive
 * options are transparent muted text. Used where the underline
 * style of `<SectionTabs>` would feel too heavy for a binary toggle
 * (community → followers/following, etc.).
 *
 * Each tab is a link, so route-based active state is implicit and
 * the browser back/forward buttons work normally.
 */
export interface PillSwitchTab {
  href: string;
  label: string;
  /** Match the path exactly (default true). Set `false` for prefix-match. */
  exact?: boolean;
}

export function PillSwitch({
  tabs,
  className,
  ariaLabel = "Section",
}: {
  tabs: PillSwitchTab[];
  className?: string;
  ariaLabel?: string;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        // Outer pill: subtle filled track. `bg-muted/60` reads as a
        // soft inset on light mode, slightly elevated on dark.
        "bg-muted/60 inline-flex items-center gap-0.5 rounded-full p-1",
        className,
      )}
    >
      {tabs.map((tab) => {
        const isActive =
          tab.exact === false
            ? pathname.startsWith(tab.href)
            : pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex h-8 items-center rounded-full px-4 text-sm font-medium transition-colors",
              isActive
                ? // Active cell: elevated white-ish surface +
                  // foreground text + subtle shadow so it reads as
                  // "lifted" out of the track.
                  "bg-background text-foreground shadow-sm"
                : // Inactive: transparent + muted text, hover bumps
                  // toward foreground without backgrounding (keeps
                  // the active cell as the only filled one).
                  "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
