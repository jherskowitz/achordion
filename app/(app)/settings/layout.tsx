import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SectionTabs, type SectionTab } from "@/components/achordion/section-tabs";

const SETTINGS_TABS: SectionTab[] = [
  { href: "/settings", label: "Profile" },
  { href: "/settings/connections", label: "Connections" },
];

export default async function SettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.mbUsername) redirect("/login");
  return (
    // Switched from a two-column side-nav grid to the same top-tab
    // pattern every other page-with-subnav uses (`/user/<name>/*`,
    // `/charts/*`, etc.). Side-nav was the only place on the site
    // that stacked vertically; on phones the column collapsed but
    // the visual register felt orphaned. SectionTabs scrolls
    // horizontally on overflow, so the strip works at every width.
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <header className="mb-6">
        <p className="text-muted-foreground mb-2 text-xs tracking-wide uppercase">
          Account
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Settings
        </h1>
      </header>
      <SectionTabs tabs={SETTINGS_TABS} className="mb-8" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
