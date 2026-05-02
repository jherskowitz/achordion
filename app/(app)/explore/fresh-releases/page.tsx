import { PageShell } from "@/components/achordion/page-shell";
import { ComingSoon } from "@/components/achordion/coming-soon";

export default function FreshReleasesPage() {
  return (
    <PageShell className="pt-8">
      <ComingSoon
        title="Fresh releases"
        description="New releases from the artists you listen to — and adjacent ones."
      />
    </PageShell>
  );
}
