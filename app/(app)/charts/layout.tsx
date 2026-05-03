import type { ReactNode } from "react";
import { SectionTabs, type SectionTab } from "@/components/achordion/section-tabs";

const CHARTS_TABS: SectionTab[] = [
  { href: "/charts/apple-music", label: "Apple Music" },
  { href: "/charts/spotify", label: "Spotify" },
  { href: "/charts/college-radio", label: "College Radio" },
];

export default function ChartsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="border-border/60 border-b">
        <div className="mx-auto max-w-7xl px-4 pt-10 sm:px-6">
          <p className="text-muted-foreground mb-2 text-xs tracking-wide uppercase">
            Charts
          </p>
          <h1 className="pb-6 text-3xl font-semibold tracking-tight sm:text-4xl">
            What everyone&apos;s playing
          </h1>
          <SectionTabs tabs={CHARTS_TABS} />
        </div>
      </header>
      {children}
    </>
  );
}
