import { PageShell } from "@/components/achordion/page-shell";
import { ComingSoon } from "@/components/achordion/coming-soon";

export default function ExploreYearInMusicPage() {
  return (
    <PageShell className="pt-8">
      <ComingSoon
        title="Year in Music"
        description="Aggregate listening recaps across the ListenBrainz community."
      />
    </PageShell>
  );
}
