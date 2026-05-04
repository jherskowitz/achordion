import Link from "next/link";
import { LogIn, Search, Settings } from "lucide-react";
import { auth } from "@/auth";
import { Wordmark } from "./wordmark";
import { ThemeToggle } from "./theme-toggle";
import {
  MainNav,
  type MainNavItem,
  type MobileExtraItem,
} from "./main-nav";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/achordion/user-avatar";

export async function SiteHeader() {
  const session = await auth();
  const username = session?.user?.mbUsername;
  const avatarUrl = session?.user?.image ?? undefined;
  const displayName = session?.user?.name ?? username ?? "";

  const nav: MainNavItem[] = [
    { href: "/explore", label: "Explore" },
    { href: "/radio", label: "Radio" },
    { href: "/charts", label: "Charts" },
  ];
  if (username) {
    nav.push({ href: "/feed", label: "My Feed" });
    nav.push({
      href: `/user/${encodeURIComponent(username)}`,
      label: "My Profile",
    });
  }

  // Items that live in the desktop header trailing region as icon
  // buttons (search) or via the avatar (settings) — but mobile only
  // has the hamburger sheet, so they need a labeled row in there too.
  // Icons are pre-rendered as elements (not component refs) so this
  // server component can pass them across the RSC boundary into MainNav
  // (a client component) without React complaining about non-plain
  // objects.
  const mobileExtras: MobileExtraItem[] = [
    {
      href: "/search",
      label: "Search",
      icon: <Search className="size-4 shrink-0" />,
    },
  ];
  if (username) {
    mobileExtras.push({
      href: "/settings",
      label: "Settings",
      icon: <Settings className="size-4 shrink-0" />,
    });
  } else {
    mobileExtras.push({
      href: "/login",
      label: "Sign In",
      icon: <LogIn className="size-4 shrink-0" />,
    });
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
          {username ? (
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
