import { PageShell } from "@/components/achordion/page-shell";
import { EmptyState } from "@/components/achordion/empty-state";

export default async function YearInMusicPage({
  params,
}: {
  params: Promise<{ name: string; year: string }>;
}) {
  const { name, year } = await params;
  return (
    <PageShell className="pt-8">
      <EmptyState
        title={`Year in Music ${year}`}
        description={`${name}'s ${year} listening recap — top artists, top albums, and the moments that defined the year.`}
      />
    </PageShell>
  );
}
