import type { ReactNode } from "react";
import { Suspense } from "react";
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
  // Fire-and-forget profile-view tracking for the /admin/profiles list.
  // Runs for every profile + sub-tab render; never awaited.
  recordProfileView(name);
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
