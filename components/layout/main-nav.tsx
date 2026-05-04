"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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
 *
 * On mobile (< md) the horizontal nav is replaced by a hamburger that
 * opens a side sheet with the same items — links auto-close the sheet
 * on click, and the active route is also highlighted there.
 */
export interface MainNavItem {
  href: string;
  label: string;
}

/**
 * Items only shown in the mobile sheet (e.g., Search, Settings,
 * Sign In) — on desktop these live as icon buttons in the header
 * trailing region, but the hamburger sheet is the only nav surface
 * mobile users have, so they need to appear there too.
 */
export interface MobileExtraItem {
  href: string;
  label: string;
  icon?: LucideIcon;
}

export function MainNav({
  items,
  mobileExtras,
  mobileFooter,
}: {
  items: MainNavItem[];
  /** Auth / search / settings links surfaced inside the mobile sheet only. */
  mobileExtras?: MobileExtraItem[];
  /** Slot for non-link controls (e.g., theme toggle) rendered at the
   *  bottom of the mobile sheet. */
  mobileFooter?: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  // Close the drawer once navigation finishes — usePathname updates on
  // route change, so we just react to that. (Clicking a link to the
  // current page wouldn't change the pathname, but in that case there's
  // nothing to navigate to anyway.)
  const lastPathRef = React.useRef(pathname);
  React.useEffect(() => {
    if (lastPathRef.current !== pathname) {
      lastPathRef.current = pathname;
      setOpen(false);
    }
  }, [pathname]);

  return (
    <>
      <nav
        aria-label="Main"
        className="hidden items-center gap-1 md:flex"
      >
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

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label="Open navigation menu"
              className="md:hidden"
            />
          }
        >
          <Menu className="size-4" />
        </SheetTrigger>
        <SheetContent side="left" className="w-72 max-w-[80vw]">
          <SheetHeader>
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <nav aria-label="Main" className="flex flex-col gap-1 px-2 pb-4">
            {items.map((item) => {
              const isActive =
                pathname === item.href ||
                pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  suppressHydrationWarning
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
            {mobileExtras && mobileExtras.length > 0 && (
              <>
                <div className="border-border/60 my-2 border-t" />
                {mobileExtras.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      suppressHydrationWarning
                      aria-current={isActive ? "page" : undefined}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {Icon && <Icon className="size-4 shrink-0" />}
                      {item.label}
                    </Link>
                  );
                })}
              </>
            )}
            {mobileFooter && (
              <>
                <div className="border-border/60 my-2 border-t" />
                <div className="flex items-center justify-between px-3 py-2">
                  {mobileFooter}
                </div>
              </>
            )}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
