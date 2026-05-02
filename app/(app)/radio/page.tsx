import { PageShell } from "@/components/achordion/page-shell";
import { ComingSoon } from "@/components/achordion/coming-soon";

export const metadata = { title: "Radio" };

export default function RadioPage() {
  return (
    <PageShell className="pt-8">
      <ComingSoon
        title="Radio"
        description="Generate radio playlists from a prompt — artist seeds, tag combinations, and more. Powered by LB Radio."
      />
    </PageShell>
  );
}
