import { Suspense } from "react";
import { getRecentListens } from "@/lib/clients/listenbrainz";
import { ScrobbleList } from "@/components/achordion/scrobble-list";
import { PageShell } from "@/components/achordion/page-shell";
import { ComingSoon } from "@/components/achordion/coming-soon";
import { Skeleton } from "@/components/ui/skeleton";

interface PageParams {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ before?: string }>;
}

async function ListensSection({
  name,
  before,
}: {
  name: string;
  before?: number;
}) {
  try {
    const listens = await getRecentListens(name, {
      count: 100,
      ...(before ? { maxTs: before } : {}),
    });
    return <ScrobbleList listens={listens} />;
  } catch (err) {
    return (
      <ComingSoon
        title="Couldn't load listens"
        description={err instanceof Error ? err.message : "Try again in a moment."}
      />
    );
  }
}

function Fallback() {
  return (
    <ul className="border-border/60 divide-border/60 divide-y rounded-xl border px-4">
      {Array.from({ length: 12 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 py-3">
          <Skeleton className="size-12 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-3 w-12" />
        </li>
      ))}
    </ul>
  );
}

export default async function ListensPage({ params, searchParams }: PageParams) {
  const { name } = await params;
  const { before } = await searchParams;
  const beforeTs = before ? Number(before) : undefined;
  return (
    <PageShell className="pt-8">
      <h2 className="mb-4 text-sm font-semibold tracking-wide uppercase">
        Listens
      </h2>
      <Suspense fallback={<Fallback />}>
        <ListensSection name={name} before={beforeTs} />
      </Suspense>
    </PageShell>
  );
}
