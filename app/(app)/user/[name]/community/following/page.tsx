import { Suspense } from "react";
import { auth } from "@/auth";
import { getFollowing } from "@/lib/clients/listenbrainz";
import { UserList } from "@/components/achordion/user-list";
import { CompatibilityVenn } from "@/components/achordion/compatibility-venn";
import { Skeleton } from "@/components/ui/skeleton";

interface PageParams {
  params: Promise<{ name: string }>;
}

async function Following({ name }: { name: string }) {
  // Resolve viewer + profile-owner sets in parallel. Compatibility
  // chart only renders when there's a signed-in viewer who isn't
  // the profile owner — see the followers page for the same shape.
  const session = await auth();
  const viewerName = session?.user?.mbUsername ?? null;
  const showCompat =
    !!viewerName && viewerName.toLowerCase() !== name.toLowerCase();

  const [following, viewerFollowing] = await Promise.all([
    getFollowing(name),
    showCompat ? getFollowing(viewerName) : Promise.resolve<string[]>([]),
  ]);
  following.sort((a, b) => a.localeCompare(b));

  let viewerOnly = 0;
  let both = 0;
  let ownerOnly = 0;
  if (showCompat) {
    const ownerLower = new Set(following.map((u) => u.toLowerCase()));
    const viewerLower = new Set(viewerFollowing.map((u) => u.toLowerCase()));
    for (const u of viewerLower) {
      if (ownerLower.has(u)) both++;
      else viewerOnly++;
    }
    for (const u of ownerLower) {
      if (!viewerLower.has(u)) ownerOnly++;
    }
  }

  return (
    <div className="space-y-6">
      {showCompat && (
        <CompatibilityVenn
          viewerLabel="You"
          ownerLabel={name}
          viewerOnly={viewerOnly}
          both={both}
          ownerOnly={ownerOnly}
          metricLabel="Following"
        />
      )}
      <UserList
        users={following}
        emptyMessage={`${name} isn't following anyone yet.`}
      />
    </div>
  );
}

function FollowingSkeleton() {
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 9 }).map((_, i) => (
        <li
          key={i}
          className="border-border/60 flex items-center gap-3 rounded-xl border px-3 py-2.5"
        >
          <Skeleton className="size-9 rounded-full" />
          <Skeleton className="h-4 w-24" />
        </li>
      ))}
    </ul>
  );
}

export default async function FollowingPage({ params }: PageParams) {
  const { name } = await params;
  return (
    <Suspense fallback={<FollowingSkeleton />}>
      <Following name={name} />
    </Suspense>
  );
}
