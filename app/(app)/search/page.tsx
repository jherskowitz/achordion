import { PageShell } from "@/components/achordion/page-shell";
import { PageHeader } from "@/components/achordion/page-header";
import { ComingSoon } from "@/components/achordion/coming-soon";

export const metadata = { title: "Search" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  return (
    <PageShell>
      <PageHeader
        eyebrow="Search"
        title={q ? `"${q}"` : "Search Achordion"}
        description="Users, artists, releases, and recordings, all in one place."
      />
      <ComingSoon
        title="Search"
        description="Wired up in Phase 2 with type-ahead and result grouping."
      />
    </PageShell>
  );
}
