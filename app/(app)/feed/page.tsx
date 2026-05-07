import Link from "next/link";
import { Suspense } from "react";
import { auth } from "@/auth";
import {
  getFollowing,
  getLovedRecordingEvents,
  getUserFeed,
  type FeedEvent,
} from "@/lib/clients/listenbrainz";
import { getLbTokenForRequest } from "@/lib/lb-token";
import { PageShell } from "@/components/achordion/page-shell";
import { EmptyState } from "@/components/achordion/empty-state";
import { FeedEventList } from "@/components/achordion/feed-event-list";
import { FilterPills } from "@/components/achordion/filter-pills";
import { TrackListActionsMenu } from "@/components/achordion/track-list-actions-menu";
import { OpenInParachordButton } from "@/components/achordion/open-in-parachord-button";
import { MarkFeedSeen } from "@/components/achordion/mark-feed-seen";
import { feedEventsToParachordTracks } from "@/lib/parachord-listens";
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
      <EmptyState
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
  // Fetch native feed + the love-events fan-out in parallel. LB's
  // feed endpoint doesn't emit loves natively, so we splice them in
  // by walking the viewer's following list and pulling each user's
  // recent feedback. Cached at the LB-client layer; steady-state
  // cost is mostly cache hits.
  const [events, lovedEvents] = await Promise.all([
    getUserFeed(name, token, { count: 50 }),
    getFollowing(name)
      .catch(() => [] as string[])
      .then((following) =>
        getLovedRecordingEvents(following).catch(() => [] as FeedEvent[]),
      ),
  ]);
  if (events === null) {
    return (
      <EmptyState
        title="Couldn't load feed"
        description="ListenBrainz didn't return your feed. Your token may have been revoked, or LB might be having a moment."
      />
    );
  }
  // Merge native feed + synthetic loves, sort by `created` desc, and
  // re-cap at the same 50 the page started with so adding loves
  // doesn't unbounded-grow the list. Self-loves are filtered with
  // the same excludeSelf logic the rest of the feed uses.
  const merged = [...events, ...lovedEvents].sort(
    (a, b) => b.created - a.created,
  );
  const sliced = merged.slice(0, 50);
  const filtered = excludeSelf
    ? sliced.filter((e) => (e.user_name ?? "") !== name)
    : sliced;
  // viewer = current user's mbUsername — lets FeedEventList hide the
  // Thanks button on the viewer's own pins / recs (LB 403s in that
  // case) while still rendering it for everyone else's.
  return <FeedEventList events={filtered} viewer={name} />;
}

async function FeedCta({
  name,
  excludeSelf,
}: {
  name: string;
  excludeSelf: boolean;
}) {
  const token = await getLbTokenForRequest();
  if (!token) return null;
  let tracks: ReturnType<typeof feedEventsToParachordTracks> = [];
  try {
    const events = await getUserFeed(name, token, { count: 50 });
    if (events) {
      const filtered = excludeSelf
        ? events.filter((e) => (e.user_name ?? "") !== name)
        : events;
      tracks = feedEventsToParachordTracks(filtered);
    }
  } catch {
    // Both buttons still render; their actions just no-op when empty.
  }
  const title = excludeSelf
    ? `${name} — Feed (others)`
    : `${name} — Feed`;
  const xspfUrl = excludeSelf
    ? "/api/me/feed.xspf?exclude_self=1"
    : "/api/me/feed.xspf";
  const xspfFilename = `${name}-feed${excludeSelf ? "-others" : ""}`;
  return (
    <div className="flex items-center gap-2">
      <OpenInParachordButton
        kind="playlist"
        tracks={tracks}
        title={title}
        creator={name}
      />
      <TrackListActionsMenu
        title={title}
        creator={name}
        tracks={tracks}
        xspfUrl={xspfUrl}
        xspfFilename={xspfFilename}
        triggerLabel="Feed actions"
      />
    </div>
  );
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
        <EmptyState
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

  return (
    <PageShell className="pt-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          My feed
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Recent activity from accounts you follow on ListenBrainz, plus
          system notifications.
        </p>
      </header>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <FilterPills
          param="source"
          active={sourceFilter}
          options={SOURCE_OPTIONS}
          defaultValue="all"
          ariaLabel="Filter feed by source"
        />
        <Suspense fallback={null}>
          <FeedCta name={viewer} excludeSelf={excludeSelf} />
        </Suspense>
      </div>
      <Suspense fallback={<FeedSkeleton />}>
        <FeedBody name={viewer} excludeSelf={excludeSelf} />
      </Suspense>
      <MarkFeedSeen />
    </PageShell>
  );
}
