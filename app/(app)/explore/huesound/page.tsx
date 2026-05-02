import { PageShell } from "@/components/achordion/page-shell";
import { ComingSoon } from "@/components/achordion/coming-soon";

export default function HuesoundPage() {
  return (
    <PageShell className="pt-8">
      <ComingSoon
        title="Huesound"
        description="Browse album art by dominant color — find music that looks like a feeling."
      />
    </PageShell>
  );
}
