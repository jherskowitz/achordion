import { PageShell } from "@/components/achordion/page-shell";
import { ComingSoon } from "@/components/achordion/coming-soon";

export default async function UserOverviewPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  return (
    <PageShell className="pt-8">
      <ComingSoon
        title="Overview"
        description={`${name}'s recent listens, top items, and listening rhythm.`}
        hint="Wired up in Phase 2."
      />
    </PageShell>
  );
}
