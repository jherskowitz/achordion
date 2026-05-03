import { PageShell } from "@/components/achordion/page-shell";
import { PageHeader } from "@/components/achordion/page-header";
import { SearchTypeahead } from "@/components/achordion/search-typeahead";

export const metadata = { title: "Search" };

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

/**
 * Server-side wrapper that picks up `?q=` for shareable / direct-URL
 * loads and hands it to the client typeahead. Type-ahead handles all
 * the live querying, debouncing, and result rendering — see
 * components/achordion/search-typeahead.tsx.
 */
export default async function SearchPage({ searchParams }: PageProps) {
  const { q = "" } = await searchParams;
  const trimmed = q.trim();

  return (
    <PageShell>
      <PageHeader
        eyebrow="Search"
        title={trimmed ? `“${trimmed}”` : "Search Achordion"}
        description="Artists, albums, songs, and users in one box. Type to see results live; prefix with artist: / album: / song: / user: to narrow."
      />
      <SearchTypeahead initialQuery={q} />
    </PageShell>
  );
}
