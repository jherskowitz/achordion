import { PageShell } from "@/components/achordion/page-shell";
import { ComingSoon } from "@/components/achordion/coming-soon";

export default function LbRadioPage() {
  return (
    <PageShell className="pt-8">
      <ComingSoon
        title="LB Radio"
        description="Generate radio playlists from a prompt — artist seeds, tag combinations, and more."
      />
    </PageShell>
  );
}
