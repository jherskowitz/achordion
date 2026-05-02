import Link from "next/link";
import { Search } from "lucide-react";
import { Wordmark } from "./wordmark";
import { ThemeToggle } from "./theme-toggle";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/explore", label: "Explore" },
  { href: "/explore/fresh-releases", label: "Fresh" },
  { href: "/explore/lb-radio", label: "Radio" },
];

export function SiteHeader() {
  return (
    <header className="border-border/60 bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40 w-full border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Wordmark />
        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Button
              key={item.href}
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link href={item.href} />}
            >
              {item.label}
            </Button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Search"
            nativeButton={false}
            render={<Link href="/search" />}
          >
            <Search className="size-4" />
          </Button>
          <ThemeToggle />
          <Button size="sm" nativeButton={false} render={<Link href="/login" />}>
            Sign in
          </Button>
        </div>
      </div>
    </header>
  );
}
