import { PageShell } from "@/components/achordion/page-shell";
import { PageHeader } from "@/components/achordion/page-header";
import { ComingSoon } from "@/components/achordion/coming-soon";

export default async function PlaylistPage({
  params,
}: {
  params: Promise<{ mbid: string }>;
}) {
  const { mbid } = await params;
  return (
    <PageShell>
      <PageHeader
        eyebrow="Playlist"
        title={mbid.slice(0, 8)}
        description="Track list, contributors, and metadata for this playlist."
        breadcrumbs={[{ label: "Playlists" }, { label: mbid.slice(0, 8) }]}
      />
      <ComingSoon title="Playlist page" />
    </PageShell>
  );
}
