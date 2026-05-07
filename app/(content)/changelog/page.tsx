import { PageShell } from "@/components/achordion/page-shell";
import { PageHeader } from "@/components/achordion/page-header";
import { EmptyState } from "@/components/achordion/empty-state";

export const metadata = { title: "Changelog" };
// See app/(content)/layout.tsx for the static-rendering rationale.
export const revalidate = 86400;

export default function ChangelogPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Changelog"
        title="What's new"
        description="Release notes and notable improvements."
      />
      <EmptyState
        title="Changelog"
        description="Phase 0 (clickable shell) shipped today. Phase 1 (full route skeleton) is what you're looking at."
      />
    </PageShell>
  );
}
