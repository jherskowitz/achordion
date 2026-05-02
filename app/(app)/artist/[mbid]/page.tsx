import { PageShell } from "@/components/achordion/page-shell";
import { PageHeader } from "@/components/achordion/page-header";
import { ComingSoon } from "@/components/achordion/coming-soon";

export default async function ArtistPage({
  params,
}: {
  params: Promise<{ mbid: string }>;
}) {
  const { mbid } = await params;
  return (
    <PageShell>
      <PageHeader
        eyebrow="Artist"
        title={mbid.slice(0, 8)}
        description="Overview, top tracks, top listeners, and similar artists."
        breadcrumbs={[{ label: "Artists" }, { label: mbid.slice(0, 8) }]}
      />
      <ComingSoon
        title="Artist page"
        description="Wired up in Phase 2 with MusicBrainz metadata and ListenBrainz top-listener data."
      />
    </PageShell>
  );
}
