import { Suspense } from "react";
import Link from "next/link";
import { auth } from "@/auth";
import { getSimilarUsers } from "@/lib/clients/listenbrainz";
import { PageShell } from "@/components/achordion/page-shell";
import { SimilarUsersList } from "@/components/achordion/similar-users-list";
import { ComingSoon } from "@/components/achordion/coming-soon";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Similar listeners" };

async function Body({ username }: { username: string }) {
  const users = await getSimilarUsers(username, 60).catch(() => []);
  return <SimilarUsersList users={users} layout="grid" />;
}

function Fallback() {
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 12 }).map((_, i) => (
        <li
          key={i}
          className="border-border/60 flex items-center gap-3 rounded-xl border px-3 py-2.5"
        >
          <Skeleton className="size-9 rounded-full" />
          <Skeleton className="h-4 flex-1" />
        </li>
      ))}
    </ul>
  );
}

export default async function SimilarUsersExplorePage() {
  const session = await auth();
  const username = session?.user?.mbUsername ?? null;
  if (!username) {
    return (
      <PageShell className="pt-8">
        <ComingSoon
          title="Sign in to see similar listeners"
          description="ListenBrainz computes similarity from your listen history."
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
