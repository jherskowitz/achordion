import { PageShell } from "@/components/achordion/page-shell";
import { ComingSoon } from "@/components/achordion/coming-soon";

export default async function FollowingPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  return (
    <PageShell className="pt-8">
      <ComingSoon
        title="Following"
        description={`People ${name} follows on ListenBrainz.`}
      />
    </PageShell>
  );
}
