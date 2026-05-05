"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Wordmark } from "./wordmark";
import { ThemeToggle } from "./theme-toggle";
import {
  MainNav,
  type MainNavItem,
  type MobileExtraItem,
} from "./main-nav";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/achordion/user-avatar";

/**
 * Sitewide top header.
 *
 * **Why this is a client component, not a server component**: the
 * earlier server version called `auth()` on every render, which
 * marked every route below the header as dynamic and prevented
 * Vercel from edge-caching entity pages (artist/release-group/
 * recording/etc). Free-tier CPU usage was 75% on launch day with
 * real users hitting the same MBIDs repeatedly via Chrome's link
 * prefetch, every hit paying the full server-render cost.
 *
 * The fix is to read the session via `useSession()` post-hydration
 * instead — the SSR output is identical for everyone (the anonymous
 * variant), which makes pages whose content doesn't depend on auth
 * state edge-cacheable. Logged-in users see the anonymous header
 * for the first paint, then `useSession()` resolves and the avatar
 * swaps in. The flash is brief and only happens once per full page
 * load (not on SPA navigation, where the existing client state
 * persists).
 *
 * `<SessionProvider>` lives in `components/providers/index.tsx` so
 * `useSession()` is available everywhere.
 */
export function SiteHeader() {
  const { data: session, status } = useSession();
  const username = session?.user?.mbUsername;
  const avatarUrl = session?.user?.image ?? undefined;
  const displayName = session?.user?.name ?? username ?? "";

  // While auth state is loading post-hydration, render the anonymous
  // variant. Same shape as the SSR output, so there's no layout
  // shift when useSession resolves.
  const showAuthed = status === "authenticated" && !!username;

  // Unread feed count — only fetched once we know the viewer is
  // signed in, polled lightly in the background while a tab is open.
  // Server returns 0 for unauthed / no-LB-token cases, so the badge
  // simply never appears in those states.
  const { data: unread } = useQuery({
    queryKey: ["me", "feed-unread"],
    queryFn: async () => {
      const r = await fetch("/api/me/feed-unread");
      if (!r.ok) return { count: 0 };
      return (await r.json()) as { count: number };
    },
    enabled: showAuthed,
    staleTime: 60_000,
    refetchInterval: 90_000,
    refetchOnWindowFocus: true,
  });
  const feedUnread = unread?.count ?? 0;

  const nav: MainNavItem[] = [
    { href: "/explore", label: "Explore" },
    { href: "/radio", label: "Radio" },
    { href: "/charts", label: "Charts" },
  ];
  if (showAuthed) {
    nav.push({ href: "/feed", label: "My Feed", badge: feedUnread });
    nav.push({
      href: `/user/${encodeURIComponent(username)}`,
      label: "My Profile",
    });
  }

  // Items that live in the desktop header trailing region as icon
  // buttons (search) or via the avatar (settings) — but mobile only
  // has the hamburger sheet, so they need a labeled row in there too.
  const mobileExtras: MobileExtraItem[] = [
    { href: "/search", label: "Search" },
  ];
  if (showAuthed) {
    mobileExtras.push({ href: "/settings", label: "Settings" });
  } else {
    mobileExtras.push({ href: "/login", label: "Sign In" });
  }

  return (
    <header className="border-border/60 bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40 w-full border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Wordmark />
        <MainNav
          items={nav}
          mobileExtras={mobileExtras}
          mobileFooter={
            <>
              <span className="text-muted-foreground text-sm">Theme</span>
              <ThemeToggle />
            </>
          }
        />
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Search"
            nativeButton={false}
            render={<Link href="/search" suppressHydrationWarning />}
          >
            <Search className="size-4" />
          </Button>
          <ThemeToggle />
          {showAuthed ? (
            <Link
              href="/settings"
              aria-label={`Settings for ${displayName}`}
              title={displayName}
              suppressHydrationWarning
              className="hover:ring-ring/40 ml-1 inline-flex rounded-full transition-shadow hover:ring-2"
            >
              <UserAvatar
                username={username}
                imageUrl={avatarUrl}
                className="size-7"
                fallbackClassName="text-xs"
              />
            </Link>
          ) : (
            <Button
              size="sm"
              nativeButton={false}
              render={<Link href="/login" suppressHydrationWarning />}
            >
              Sign In
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
