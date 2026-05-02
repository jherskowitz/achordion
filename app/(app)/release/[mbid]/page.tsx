import { PageShell } from "@/components/achordion/page-shell";
import { PageHeader } from "@/components/achordion/page-header";
import { ComingSoon } from "@/components/achordion/coming-soon";

export default async function ReleasePage({
  params,
}: {
  params: Promise<{ mbid: string }>;
}) {
  const { mbid } = await params;
  return (
    <PageShell>
      <PageHeader
        eyebrow="Release"
        title={mbid.slice(0, 8)}
        description="A specific release — track listing, cover art, format, and label."
        breadcrumbs={[{ label: "Releases" }, { label: mbid.slice(0, 8) }]}
      />
      <ComingSoon title="Release page" />
    </PageShell>
  );
}
