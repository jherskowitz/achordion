import type { ReactNode } from "react";
import { PageShell } from "@/components/achordion/page-shell";
import {
  PillSwitch,
  type PillSwitchTab,
} from "@/components/achordion/pill-switch";

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ name: string }>;
}

export default async function CommunityLayout({ children, params }: LayoutProps) {
  const { name } = await params;
  const tabs: PillSwitchTab[] = [
    { href: `/user/${name}/community/followers`, label: "Followers" },
    { href: `/user/${name}/community/following`, label: "Following" },
  ];
  return (
    <PageShell className="pt-6">
      {/* A binary follower/following choice reads cleaner as a pill
          switch than as full-width underline tabs — it visually says
          "pick one of two views" rather than "navigate sections." */}
      <PillSwitch
        tabs={tabs}
        ariaLabel="Community view"
        className="mb-6"
      />
      {children}
    </PageShell>
  );
}
