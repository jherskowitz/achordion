import { PageShell } from "@/components/achordion/page-shell";
import { PageHeader } from "@/components/achordion/page-header";
import { ComingSoon } from "@/components/achordion/coming-soon";

export default async function ReleaseGroupPage({
  params,
}: {
  params: Promise<{ mbid: string }>;
}) {
  const { mbid } = await params;
  return (
    <PageShell>
      <PageHeader
        eyebrow="Album"
        title={mbid.slice(0, 8)}
        description="Album-level page covering all reissues and editions."
        breadcrumbs={[{ label: "Albums" }, { label: mbid.slice(0, 8) }]}
      />
      <ComingSoon title="Album page" />
    </PageShell>
  );
}
