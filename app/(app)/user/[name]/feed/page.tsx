import Link from "next/link";
import { Suspense } from "react";
import { auth } from "@/auth";
import { getUserFeed } from "@/lib/clients/listenbrainz";
import { getLbTokenForRequest } from "@/lib/lb-token";
import { PageShell } from "@/components/achordion/page-shell";
import { ComingSoon } from "@/components/achordion/coming-soon";
import { FeedEventList } from "@/components/achordion/feed-event-list";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Feed" };

interface PageParams {
  params: Promise<{ name: string }>;
}

async function FeedBody({ name }: { name: string }) {
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
  return <FeedEventList events={events} />;
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

export default async function FeedPage({ params }: PageParams) {
  const { name } = await params;
  const session = await auth();
  const viewer = session?.user?.mbUsername ?? null;
  const isOwnFeed =
    !!viewer && viewer.toLowerCase() === name.toLowerCase();

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

  if (!isOwnFeed) {
    return (
      <PageShell className="pt-8">
        <ComingSoon
          title="That feed is private"
          description={`Only ${name} can view their own ListenBrainz feed.`}
          hint={
            <Button
              size="sm"
              nativeButton={false}
              render={<Link href={`/user/${encodeURIComponent(viewer)}/feed`} />}
            >
              Go to your feed
            </Button>
          }
        />
      </PageShell>
    );
  }

  return (
    <PageShell className="pt-8">
      <header className="mb-6">
        <h2 className="text-sm font-semibold tracking-wide uppercase">
          Your feed
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Recent activity from accounts you follow on ListenBrainz, plus
          system notifications.
        </p>
      </header>
      <Suspense fallback={<FeedSkeleton />}>
        <FeedBody name={name} />
      </Suspense>
    </PageShell>
  );
}
