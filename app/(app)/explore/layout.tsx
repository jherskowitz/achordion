import type { ReactNode } from "react";
import { SectionTabs, type SectionTab } from "@/components/achordion/section-tabs";

const EXPLORE_TABS: SectionTab[] = [
  { href: "/explore", label: "Just for You" },
  { href: "/explore/fresh-releases", label: "Fresh Releases" },
  { href: "/explore/critical-darlings", label: "Critical Darlings" },
  { href: "/explore/similar-users", label: "Similar Users" },
  { href: "/explore/year-in-music", label: "Year In Music" },
];

export default function ExploreLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="border-border/60 border-b">
        <div className="mx-auto max-w-7xl px-4 pt-10 sm:px-6">
          <p className="text-muted-foreground mb-2 text-xs tracking-wide uppercase">
            Explore
          </p>
          <h1 className="pb-6 text-3xl font-semibold tracking-tight sm:text-4xl">
            Find your music. Find your people. Share.
          </h1>
          <SectionTabs tabs={EXPLORE_TABS} />
        </div>
      </header>
      {children}
    </>
  );
}
