import { PageShell } from "@/components/achordion/page-shell";
import { PageHeader } from "@/components/achordion/page-header";
import { ComingSoon } from "@/components/achordion/coming-soon";

export default async function RecordingPage({
  params,
}: {
  params: Promise<{ mbid: string }>;
}) {
  const { mbid } = await params;
  return (
    <PageShell>
      <PageHeader
        eyebrow="Track"
        title={mbid.slice(0, 8)}
        description="A specific recording — appearances, listeners, and related works."
        breadcrumbs={[{ label: "Tracks" }, { label: mbid.slice(0, 8) }]}
      />
      <ComingSoon title="Track page" />
    </PageShell>
  );
}
