import { Suspense } from "react";
import Link from "next/link";
import { auth } from "@/auth";
import {
  getRecommendedRecordings,
  getRecordingMetadata,
} from "@/lib/clients/listenbrainz";
import { PageShell } from "@/components/achordion/page-shell";
import { ExploreTrackList } from "@/components/achordion/explore-track-list";
import { ComingSoon } from "@/components/achordion/coming-soon";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Recommended tracks" };

async function Body({ username }: { username: string }) {
  const recordings = await getRecommendedRecordings(
    username,
    50,
    "raw",
  ).catch(() => []);
  if (recordings.length === 0) {
    return (
      <ComingSoon
        title="No recommendations yet"
        description="Listen for a few weeks and ListenBrainz will surface picks here."
      />
    );
  }
  const metadata = await getRecordingMetadata(
    recordings.map((r) => r.recording_mbid),
  );
  return <ExploreTrackList recordings={recordings} metadata={metadata} />;
}

function Fallback() {
  return (
    <ol className="border-border/60 divide-border/60 divide-y rounded-xl border px-4">
      {Array.from({ length: 12 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 py-3">
          <Skeleton className="size-4" />
          <Skeleton className="size-10 rounded-md" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </li>
      ))}
    </ol>
  );
}

export default async function RecommendedTracksPage() {
  const session = await auth();
  const username = session?.user?.mbUsername ?? null;
  if (!username) {
    return (
      <PageShell className="pt-8">
        <ComingSoon
          title="Sign in for recommended tracks"
          description="LB's collaborative-filter model picks tracks based on listeners with overlapping taste."
          hint={
            <Button size="sm" nativeButton={false} render={<Link href="/login" />}>
              Continue with MusicBrainz
            </Button>
          }
        />
      </PageShell>
    );
  }
  return (
    <PageShell className="pt-8">
      <Suspense fallback={<Fallback />}>
        <Body username={username} />
      </Suspense>
    </PageShell>
  );
}
