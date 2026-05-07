import { Suspense } from "react";
import { getRecentListens } from "@/lib/clients/listenbrainz";
import { ScrobbleList } from "@/components/achordion/scrobble-list";
import { TrackListActionsMenu } from "@/components/achordion/track-list-actions-menu";
import { OpenInParachordButton } from "@/components/achordion/open-in-parachord-button";
import { PageShell } from "@/components/achordion/page-shell";
import { EmptyState } from "@/components/achordion/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { listensToParachordTracks } from "@/lib/parachord-listens";

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
      <EmptyState
        title="Couldn't load listens"
        description={err instanceof Error ? err.message : "Try again in a moment."}
      />
    );
  }
}

async function ListensCta({ name }: { name: string }) {
  // Pull a recent slice (same count as the visible list) to seed
  // both Play-in-Parachord and Save-to-Parachord. The XSPF download
  // endpoint pulls its own canonical slice.
  let tracks: ReturnType<typeof listensToParachordTracks> = [];
  try {
    const listens = await getRecentListens(name, { count: 100 });
    tracks = listensToParachordTracks(listens);
  } catch {
    // Both buttons still render; their actions just no-op when empty.
  }
  return (
    <div className="flex items-center gap-2">
      <OpenInParachordButton
        kind="playlist"
        tracks={tracks}
        title={`${name} — Recently played`}
        creator={name}
      />
      <TrackListActionsMenu
        title={`${name} — Recently played`}
        creator={name}
        tracks={tracks}
        xspfUrl={`/api/user/${encodeURIComponent(name)}/recent-listens.xspf`}
        xspfFilename={`${name}-recently-played`}
        triggerLabel="Recently played actions"
      />
    </div>
  );
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
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide uppercase">
          Listens
        </h2>
        <Suspense fallback={null}>
          <ListensCta name={name} />
        </Suspense>
      </div>
      <Suspense fallback={<Fallback />}>
        <ListensSection name={name} before={beforeTs} />
      </Suspense>
    </PageShell>
  );
}
