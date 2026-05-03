import type { ReactNode } from "react";
import { SectionTabs, type SectionTab } from "@/components/achordion/section-tabs";

const RADIO_TABS: SectionTab[] = [
  // Prefix-match so the station-detail page (/radio/rewind/<id>) keeps
  // the Radio Rewinds tab highlighted.
  { href: "/radio/rewind", label: "Radio Rewinds", exact: false },
  { href: "/radio/builder", label: "Station Builder" },
];

export default function RadioLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="border-border/60 border-b">
        <div className="mx-auto max-w-7xl px-4 pt-10 sm:px-6">
          <p className="text-muted-foreground mb-2 text-xs tracking-wide uppercase">
            Radio
          </p>
          <h1 className="pb-6 text-3xl font-semibold tracking-tight sm:text-4xl">
            Pick a station, build your own
          </h1>
          <SectionTabs tabs={RADIO_TABS} />
        </div>
      </header>
      {children}
    </>
  );
}
