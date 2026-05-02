import { PageShell } from "@/components/achordion/page-shell";
import { PageHeader } from "@/components/achordion/page-header";
import { ComingSoon } from "@/components/achordion/coming-soon";

export const metadata = { title: "Changelog" };

export default function ChangelogPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Changelog"
        title="What's new"
        description="Release notes and notable improvements."
      />
      <ComingSoon
        title="Changelog"
        description="Phase 0 (clickable shell) shipped today. Phase 1 (full route skeleton) is what you're looking at."
      />
    </PageShell>
  );
}
