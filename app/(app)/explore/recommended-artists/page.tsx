import { Suspense } from "react";
import Link from "next/link";
import { auth } from "@/auth";
import {
  getRecommendedRecordings,
  getRecordingMetadata,
} from "@/lib/clients/listenbrainz";
import { PageShell } from "@/components/achordion/page-shell";
import { RecommendedArtistsList } from "@/components/achordion/recommended-artists-list";
import { ComingSoon } from "@/components/achordion/coming-soon";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Recommended artists" };

async function Body({ username }: { username: string }) {
  const recordings = await getRecommendedRecordings(
    username,
    100,
    "raw",
  ).catch(() => []);
  if (recordings.length === 0) {
    return (
      <ComingSoon
        title="No recommendations yet"
        description="ListenBrainz starts surfacing recommendations after a few weeks of listens."
      />
    );
  }
  const metadata = await getRecordingMetadata(
    recordings.map((r) => r.recording_mbid),
  );
  return (
    <RecommendedArtistsList
      recordings={recordings}
      metadata={metadata}
      limit={48}
    />
  );
}

function Fallback() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 24 }).map((_, i) => (
        <div
          key={i}
          className="border-border/60 space-y-2 rounded-xl border p-4"
        >
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export default async function RecommendedArtistsPage() {
  const session = await auth();
  const username = session?.user?.mbUsername ?? null;
  if (!username) {
    return (
      <PageShell className="pt-8">
        <ComingSoon
          title="Sign in for recommended artists"
          description="LB's collaborative-filter model lifts artists out of your top track recommendations."
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
