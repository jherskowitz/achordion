"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Top-level site navigation rendered inside SiteHeader. Lives in its
 * own client component so the rest of the header — which calls
 * `auth()` server-side — can stay an async server component while
 * still getting `usePathname()` for the active-tab highlight.
 *
 * Active matching is prefix-based: `/explore` is active on `/explore`
 * and any `/explore/*`, etc. That's what we want for the sub-tabbed
 * sections (Charts, Radio, Explore Overview/Year-in-Music/Critical
 * Darlings) and for the user profile tabs.
 */
export interface MainNavItem {
  href: string;
  label: string;
}

export function MainNav({ items }: { items: MainNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="hidden items-center gap-1 md:flex">
      {items.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Button
            key={item.href}
            variant="ghost"
            size="sm"
            nativeButton={false}
            // suppressHydrationWarning — the Parachord browser
            // extension stamps `data-parachord-btn` on anchors, which
            // would otherwise fire a hydration mismatch.
            render={<Link href={item.href} suppressHydrationWarning />}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              isActive &&
                "bg-muted text-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {item.label}
          </Button>
        );
      })}
    </nav>
  );
}
