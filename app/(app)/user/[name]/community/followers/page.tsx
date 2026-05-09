import { Suspense } from "react";
import { auth } from "@/auth";
import { getFollowers } from "@/lib/clients/listenbrainz";
import { UserList } from "@/components/achordion/user-list";
import { CompatibilityVenn } from "@/components/achordion/compatibility-venn";
import { Skeleton } from "@/components/ui/skeleton";

interface PageParams {
  params: Promise<{ name: string }>;
}

async function Followers({ name }: { name: string }) {
  // Resolve viewer + profile-owner sets in parallel. Viewer's set
  // is only needed when we have a signed-in viewer who isn't the
  // profile owner — comparing yourself to yourself is a noop.
  const session = await auth();
  const viewerName = session?.user?.mbUsername ?? null;
  const showCompat =
    !!viewerName && viewerName.toLowerCase() !== name.toLowerCase();

  const [followers, viewerFollowers] = await Promise.all([
    getFollowers(name),
    showCompat ? getFollowers(viewerName) : Promise.resolve<string[]>([]),
  ]);
  followers.sort((a, b) => a.localeCompare(b));

  // Case-insensitive set math — LB usernames are case-sensitive on
  // the surface but matching case-insensitively avoids missing an
  // overlap because someone capitalized a letter differently.
  let viewerOnly = 0;
  let both = 0;
  let ownerOnly = 0;
  if (showCompat) {
    const ownerLower = new Set(followers.map((u) => u.toLowerCase()));
    const viewerLower = new Set(viewerFollowers.map((u) => u.toLowerCase()));
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
          metricLabel="Followers"
        />
      )}
      <UserList
        users={followers}
        emptyMessage={`No one is following ${name} yet.`}
      />
    </div>
  );
}

function FollowersSkeleton() {
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

export default async function FollowersPage({ params }: PageParams) {
  const { name } = await params;
  return (
    <Suspense fallback={<FollowersSkeleton />}>
      <Followers name={name} />
    </Suspense>
  );
}
