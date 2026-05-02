import { PageShell } from "@/components/achordion/page-shell";
import { ComingSoon } from "@/components/achordion/coming-soon";

export default function ExploreOverviewPage() {
  return (
    <PageShell className="pt-8">
      <ComingSoon
        title="Explore"
        description="Curated entry points into ListenBrainz: fresh releases, similar listeners, LB Radio, and more."
      />
    </PageShell>
  );
}
