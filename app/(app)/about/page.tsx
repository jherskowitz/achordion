import { PageShell } from "@/components/achordion/page-shell";
import { PageHeader } from "@/components/achordion/page-header";
import { ComingSoon } from "@/components/achordion/coming-soon";

export const metadata = { title: "About" };

export default function AboutPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="About"
        title="What Achordion is"
        description="An open-source alternative front-end for ListenBrainz. Sister project to Parachord."
      />
      <ComingSoon
        title="About page"
        description="Project history, contributors, and a thank-you to the MetaBrainz Foundation."
      />
    </PageShell>
  );
}
