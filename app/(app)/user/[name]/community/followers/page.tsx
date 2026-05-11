import { Suspense } from "react";
import { auth } from "@/auth";
import { getFollowers } from "@/lib/clients/listenbrainz";
import { resolveBskyAvatarsForUsers } from "@/lib/bsky-display";
import { UserList } from "@/components/achordion/user-list";
import { Skeleton } from "@/components/ui/skeleton";

interface PageParams {
  params: Promise<{ name: string }>;
}

async function Followers({ name }: { name: string }) {
  const followers = await getFollowers(name);
  followers.sort((a, b) => a.localeCompare(b));
  // Batch-fetch bsky avatar overrides for the visible list. Each
  // linked user's avatar swaps from DiceBear; unlinked rows keep
  // the default. See lib/bsky-display.ts for the cost shape.
  const session = await auth();
  const viewer = session?.user?.mbUsername ?? null;
  const bskyAvatars = await resolveBskyAvatarsForUsers(viewer, followers);
  return (
    <UserList
      users={followers}
      bskyAvatars={bskyAvatars}
      emptyMessage={`No one is following ${name} yet.`}
    />
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
