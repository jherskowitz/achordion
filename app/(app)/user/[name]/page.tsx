import Link from "next/link";
import { Suspense } from "react";
import {
  getRecentListens,
  getCurrentPin,
} from "@/lib/clients/listenbrainz";
import { LiveScrobbleList } from "@/components/achordion/live-scrobble-list";
import { TrackListActionsMenu } from "@/components/achordion/track-list-actions-menu";
import { OpenInParachordButton } from "@/components/achordion/open-in-parachord-button";
import { listensToParachordTracks } from "@/lib/parachord-listens";
import { auth } from "@/auth";
import { PinnedTrackCard } from "@/components/achordion/pinned-track-card";
import { PageShell } from "@/components/achordion/page-shell";
import { ComingSoon } from "@/components/achordion/coming-soon";
import {
  WeeklyStatsSidebar,
  WeeklyStatsSidebarSkeleton,
} from "@/components/achordion/weekly-stats-sidebar";
import { Skeleton } from "@/components/ui/skeleton";

interface PageParams {
  params: Promise<{ name: string }>;
}

async function PinnedSection({
  name,
  viewer,
}: {
  name: string;
  viewer: string | null;
}) {
  try {
    const pin = await getCurrentPin(name);
    if (!pin) return null;
    // Thankable when the viewer isn't the profile owner. LB also
    // requires the viewer to be following the pin owner — we don't
    // pre-check; the button surfaces the LB error if not.
    const thankable =
      !!viewer && viewer.toLowerCase() !== name.toLowerCase();
    // The card owns the MB fetch for its external-links row and
    // streams the favicons in via Suspense — no per-page wiring needed.
    return <PinnedTrackCard pin={pin} variant="hero" thankable={thankable} />;
  } catch {
    return null;
  }
}

async function RecentListensSection({ name }: { name: string }) {
  try {
    const listens = await getRecentListens(name, { count: 25 });
    return (
      <>
        <LiveScrobbleList username={name} initialListens={listens} />
        {listens.length > 0 && (
          <div className="mt-6 text-center">
            <Link
              href={`/user/${name}/listens`}
              className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
            >
              See full listen history →
            </Link>
          </div>
        )}
      </>
    );
  } catch (err) {
    return (
      <ComingSoon
        title="Couldn't reach ListenBrainz"
        description={err instanceof Error ? err.message : "Try again in a moment."}
      />
    );
  }
}

async function RecentListensCta({ name }: { name: string }) {
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
        triggerLabel="Recent listens actions"
      />
    </div>
  );
}

function ScrobbleListSkeleton() {
  return (
    <ul className="border-border/60 divide-border/60 divide-y rounded-xl border px-4">
      {Array.from({ length: 8 }).map((_, i) => (
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

export default async function UserOverviewPage({ params }: PageParams) {
  const { name } = await params;
  const session = await auth();
  const viewer = session?.user?.mbUsername ?? null;
  return (
    <PageShell className="pt-8">
      <Suspense fallback={null}>
        <PinnedSection name={name} viewer={viewer} />
      </Suspense>
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold tracking-wide uppercase">
              Recent listens
            </h2>
            <Suspense fallback={null}>
              <RecentListensCta name={name} />
            </Suspense>
          </div>
          <Suspense fallback={<ScrobbleListSkeleton />}>
            <RecentListensSection name={name} />
          </Suspense>
        </div>
        <aside className="space-y-4">
          <h2 className="text-sm font-semibold tracking-wide uppercase">
            In Heavy Rotation
          </h2>
          <Suspense fallback={<WeeklyStatsSidebarSkeleton />}>
            <WeeklyStatsSidebar name={name} />
          </Suspense>
        </aside>
      </div>
    </PageShell>
  );
}
