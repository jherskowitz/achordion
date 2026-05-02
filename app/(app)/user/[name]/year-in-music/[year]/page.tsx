import { PageShell } from "@/components/achordion/page-shell";
import { ComingSoon } from "@/components/achordion/coming-soon";

export default async function YearInMusicPage({
  params,
}: {
  params: Promise<{ name: string; year: string }>;
}) {
  const { name, year } = await params;
  return (
    <PageShell className="pt-8">
      <ComingSoon
        title={`Year in Music ${year}`}
        description={`${name}'s ${year} listening recap — top artists, top albums, and the moments that defined the year.`}
      />
    </PageShell>
  );
}
