import Link from "next/link";
import { Suspense } from "react";
import { auth } from "@/auth";
import { getUserFeed } from "@/lib/clients/listenbrainz";
import { getLbTokenForRequest } from "@/lib/lb-token";
import { PageShell } from "@/components/achordion/page-shell";
import { ComingSoon } from "@/components/achordion/coming-soon";
import { FeedEventList } from "@/components/achordion/feed-event-list";
import { FilterPills } from "@/components/achordion/filter-pills";
import { TrackListActionsMenu } from "@/components/achordion/track-list-actions-menu";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "My feed" };

async function FeedBody({
  name,
  excludeSelf,
}: {
  name: string;
  excludeSelf: boolean;
}) {
  const token = await getLbTokenForRequest();
  if (!token) {
    return (
      <ComingSoon
        title="Feed needs your ListenBrainz token"
        description="Add your LB token in Settings → Connections to load your feed. The feed endpoint is private — only you can see your own."
        hint={
          <Button
            size="sm"
            nativeButton={false}
            render={<Link href="/settings/connections" />}
          >
            Open settings
          </Button>
        }
      />
    );
  }
  const events = await getUserFeed(name, token, { count: 50 });
  if (events === null) {
    return (
      <ComingSoon
        title="Couldn't load feed"
        description="ListenBrainz didn't return your feed. Your token may have been revoked, or LB might be having a moment."
      />
    );
  }
  const filtered = excludeSelf
    ? events.filter((e) => (e.user_name ?? "") !== name)
    : events;
  return <FeedEventList events={filtered} />;
}

function FeedSkeleton() {
  return (
    <ul className="border-border/60 divide-border/60 divide-y rounded-xl border px-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <li key={i} className="flex items-start gap-3 py-3">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </li>
      ))}
    </ul>
  );
}

type SourceFilter = "all" | "others";

const SOURCE_OPTIONS: ReadonlyArray<{ value: SourceFilter; label: string }> = [
  { value: "all", label: "All activity" },
  { value: "others", label: "Hide my own" },
];

interface FeedPageProps {
  searchParams: Promise<{ source?: string }>;
}

export default async function FeedPage({ searchParams }: FeedPageProps) {
  const { source } = await searchParams;
  const sourceFilter: SourceFilter = source === "others" ? "others" : "all";
  const excludeSelf = sourceFilter === "others";
  const session = await auth();
  const viewer = session?.user?.mbUsername ?? null;

  if (!viewer) {
    return (
      <PageShell className="pt-8">
        <ComingSoon
          title="Sign in to view your feed"
          description="Feeds are private — only you can see your own follows, pins, and notifications."
          hint={
            <Button
              size="sm"
              nativeButton={false}
              render={<Link href="/login" />}
            >
              Continue with MusicBrainz
            </Button>
          }
        />
      </PageShell>
    );
  }

  const xspfUrl = excludeSelf
    ? "/api/me/feed.xspf?exclude_self=1"
    : "/api/me/feed.xspf";
  const xspfFilename = `${viewer}-feed${excludeSelf ? "-others" : ""}`;
  return (
    <PageShell className="pt-8">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            My feed
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Recent activity from accounts you follow on ListenBrainz, plus
            system notifications.
          </p>
        </div>
        {/* Tracks aren't pre-fetched at the page level — Save-to-Parachord
            is omitted for the feed (events are heterogenous and the per-feed
            track list isn't well-defined). XSPF download still works. */}
        <TrackListActionsMenu
          title={
            excludeSelf
              ? `${viewer} — Feed (others)`
              : `${viewer} — Feed`
          }
          creator={viewer}
          tracks={[]}
          xspfUrl={xspfUrl}
          xspfFilename={xspfFilename}
          triggerLabel="Feed actions"
        />
      </header>
      <div className="mb-4">
        <FilterPills
          param="source"
          active={sourceFilter}
          options={SOURCE_OPTIONS}
          defaultValue="all"
          ariaLabel="Filter feed by source"
        />
      </div>
      <Suspense fallback={<FeedSkeleton />}>
        <FeedBody name={viewer} excludeSelf={excludeSelf} />
      </Suspense>
    </PageShell>
  );
}
