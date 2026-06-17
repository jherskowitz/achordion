import type { ReactNode } from "react";
import { Suspense } from "react";
import { auth } from "@/auth";
import {
  UserPageHeader,
  UserPageHeaderSkeleton,
} from "@/components/achordion/user-page-header";
import { recordProfileView } from "@/lib/profile-views";

export default async function UserLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  // Profile-view tracking for the /admin/profiles list — but only for
  // SIGNED-IN viewers. Anonymous traffic to /user/<name> is almost
  // entirely crawlers enumerating real ListenBrainz accounts (incl.
  // long-dormant email/domain-named spam signups), which buried the
  // real signal. Authenticated views are the meaningful "who are people
  // actually looking at" metric. `auth()` is request-cached (the header
  // reads it too), so this adds no real cost; the write stays
  // fire-and-forget.
  const session = await auth();
  if (session?.user?.mbUsername) recordProfileView(name);
  return (
    <>
      {/* Own Suspense boundary so the header's upstream calls (playing-
          now / following / Bluesky) stream independently and never gate
          the tab content below — which has its own per-section Suspense
          and should paint without waiting on the header. */}
      <Suspense fallback={<UserPageHeaderSkeleton />}>
        <UserPageHeader name={name} />
      </Suspense>
      {children}
    </>
  );
}
