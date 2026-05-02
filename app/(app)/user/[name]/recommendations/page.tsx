import { PageShell } from "@/components/achordion/page-shell";
import { ComingSoon } from "@/components/achordion/coming-soon";

export default async function RecommendationsPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  return (
    <PageShell className="pt-8">
      <ComingSoon
        title="Recommendations"
        description={`Recordings ListenBrainz thinks ${name} will like — based on collaborative filtering and raw plays.`}
      />
    </PageShell>
  );
}
