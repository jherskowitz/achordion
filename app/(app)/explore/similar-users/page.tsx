import { PageShell } from "@/components/achordion/page-shell";
import { ComingSoon } from "@/components/achordion/coming-soon";

export default function SimilarUsersPage() {
  return (
    <PageShell className="pt-8">
      <ComingSoon
        title="Similar users"
        description="ListenBrainz users with overlapping taste — see what they're playing."
      />
    </PageShell>
  );
}
