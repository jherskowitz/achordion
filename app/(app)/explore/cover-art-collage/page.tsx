import { PageShell } from "@/components/achordion/page-shell";
import { ComingSoon } from "@/components/achordion/coming-soon";

export default function CoverArtCollagePage() {
  return (
    <PageShell className="pt-8">
      <ComingSoon
        title="Cover art collage"
        description="Build a shareable grid of your favorite album art."
      />
    </PageShell>
  );
}
