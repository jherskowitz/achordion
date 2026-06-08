import type { ReactNode } from "react";
import { Suspense } from "react";
import {
  UserPageHeader,
  UserPageHeaderSkeleton,
} from "@/components/achordion/user-page-header";

export default async function UserLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
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
