import { Suspense } from "react";
import { getFollowing } from "@/lib/clients/listenbrainz";
import { UserList } from "@/components/achordion/user-list";
import { Skeleton } from "@/components/ui/skeleton";

interface PageParams {
  params: Promise<{ name: string }>;
}

async function Following({ name }: { name: string }) {
  const following = await getFollowing(name);
  following.sort((a, b) => a.localeCompare(b));
  return (
    <UserList
      users={following}
      emptyMessage={`${name} isn't following anyone yet.`}
    />
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
