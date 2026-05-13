import { Suspense } from "react";
import { getUserPlaylists } from "@/lib/clients/listenbrainz";
import { auth } from "@/auth";
import { getLbTokenForRequest } from "@/lib/lb-token";
import { PageShell } from "@/components/achordion/page-shell";
import { EmptyState } from "@/components/achordion/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PlaylistsBrowser } from "./playlists-browser";

interface PageParams {
  params: Promise<{ name: string }>;
}

const INITIAL_BATCH = 100;

function ListShellFallback() {
  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <li key={i}>
          <div className="border-border/60 flex gap-3 rounded-xl border px-4 py-3">
            <Skeleton className="size-16 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

async function PlaylistsList({ name }: { name: string }) {
  // Self-view: attach the viewer's LB token so private playlists
  // show up alongside public ones (LB returns public-only to
  // unauthenticated callers). Any other viewer sees the public list.
  const session = await auth();
  const viewer = session?.user?.mbUsername;
  const isSelf =
    !!viewer && viewer.toLowerCase() === name.toLowerCase();
  const token = isSelf ? await getLbTokenForRequest() : null;

  let page;
  try {
    page = await getUserPlaylists(
      name,
      INITIAL_BATCH,
      0,
      token ?? undefined,
    );
  } catch (err) {
    return (
      <EmptyState
        title="Couldn't load playlists"
        description={err instanceof Error ? err.message : ""}
      />
    );
  }

  // Hand off entirely to the client browser — it owns filter, sort,
  // load-more, and IntersectionObserver-driven mosaic loading. The
  // server's only job is the auth-gated first fetch.
  return <PlaylistsBrowser name={name} initial={page} isSelf={isSelf} />;
}

export default async function PlaylistsPage({ params }: PageParams) {
  const { name } = await params;
  return (
    <PageShell className="pt-8">
      <h2 className="mb-6 text-sm font-semibold tracking-wide uppercase">
        Playlists
      </h2>
      <Suspense fallback={<ListShellFallback />}>
        <PlaylistsList name={name} />
      </Suspense>
    </PageShell>
  );
}
