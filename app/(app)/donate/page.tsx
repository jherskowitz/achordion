import { PageShell } from "@/components/achordion/page-shell";
import { PageHeader } from "@/components/achordion/page-header";
import { ComingSoon } from "@/components/achordion/coming-soon";

export const metadata = { title: "Donate" };

export default function DonatePage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Donate"
        title="Support the projects that make this possible"
        description="Achordion sits on top of MetaBrainz infrastructure. If you enjoy it, please consider supporting MusicBrainz and ListenBrainz directly."
      />
      <ComingSoon
        title="Donate links"
        description="Pointers to MetaBrainz Foundation and ways to chip in for hosting."
      />
    </PageShell>
  );
}
