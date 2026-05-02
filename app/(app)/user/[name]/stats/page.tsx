import { PageShell } from "@/components/achordion/page-shell";
import { ComingSoon } from "@/components/achordion/coming-soon";

export default async function StatsPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  return (
    <PageShell className="pt-8">
      <ComingSoon
        title="Stats"
        description={`Top artists, albums, and tracks for ${name} — by week, month, year, or all time.`}
      />
    </PageShell>
  );
}
