import type { ReactNode } from "react";
import { PageShell } from "@/components/achordion/page-shell";
import { SectionTabs, type SectionTab } from "@/components/achordion/section-tabs";

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ name: string }>;
}

export default async function CommunityLayout({ children, params }: LayoutProps) {
  const { name } = await params;
  const tabs: SectionTab[] = [
    { href: `/user/${name}/community/followers`, label: "Followers" },
    { href: `/user/${name}/community/following`, label: "Following" },
  ];
  return (
    <PageShell className="pt-6">
      {/* Drop the full-width divider; the per-tab underline alone reads
          as "sub-tabs" against the page header above. */}
      <SectionTabs tabs={tabs} className="mb-6 border-b-0" />
      {children}
    </PageShell>
  );
}
