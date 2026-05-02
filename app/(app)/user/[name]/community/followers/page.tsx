import { Suspense } from "react";
import { getFollowers } from "@/lib/clients/listenbrainz";
import { UserList } from "@/components/achordion/user-list";
import { Skeleton } from "@/components/ui/skeleton";

interface PageParams {
  params: Promise<{ name: string }>;
}

async function Followers({ name }: { name: string }) {
  const followers = await getFollowers(name);
  followers.sort((a, b) => a.localeCompare(b));
  return (
    <UserList
      users={followers}
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
