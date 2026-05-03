import { Suspense } from "react";
import Link from "next/link";
import { auth } from "@/auth";
import {
  getRecommendedRecordings,
  getRecordingMetadata,
} from "@/lib/clients/listenbrainz";
import { buildExcludedArtistSet } from "@/lib/exclude-listened";
import { thresholdFromFamiliarity } from "@/lib/familiarity";
import { FamiliaritySlider } from "@/components/achordion/familiarity-slider";
import { PageShell } from "@/components/achordion/page-shell";
import { RecommendedArtistsList } from "@/components/achordion/recommended-artists-list";
import { ComingSoon } from "@/components/achordion/coming-soon";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Recommended artists" };

interface PageProps {
  searchParams: Promise<{ familiarity?: string }>;
}

function parseFamiliarity(raw: string | undefined): number {
  if (!raw) return 50;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, n));
}

async function Body({
  username,
  familiarity,
}: {
  username: string;
  familiarity: number;
}) {
  const threshold = thresholdFromFamiliarity(familiarity);
  const [recordings, exclude] = await Promise.all([
    getRecommendedRecordings(username, 200, "raw").catch(() => []),
    buildExcludedArtistSet(username, threshold),
  ]);
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
      excludeMbids={exclude}
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

export default async function RecommendedArtistsPage({
  searchParams,
}: PageProps) {
  const sp = await searchParams;
  const familiarity = parseFamiliarity(sp.familiarity);
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
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        Recommended artists
      </h1>
      <div className="mb-3">
        <FamiliaritySlider initial={familiarity} param="familiarity" />
      </div>
      {/* Suspense keyed on the resolved threshold (not the raw slider
          value) so within-bucket nudges don't trigger pointless
          skeleton flashes. */}
      <Suspense
        key={`${thresholdFromFamiliarity(familiarity) ?? "off"}`}
        fallback={<Fallback />}
      >
        <Body username={username} familiarity={familiarity} />
      </Suspense>
    </PageShell>
  );
}
