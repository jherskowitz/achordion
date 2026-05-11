import type { ReactNode } from "react";
import { Suspense } from "react";
import { auth } from "@/auth";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { AnnouncementBanner } from "@/components/layout/announcement-banner";
import { LovedTracksProvider } from "@/components/achordion/loved-tracks-provider";
import { getUserLovedRecordings } from "@/lib/clients/listenbrainz";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const username = session?.user?.mbUsername ?? null;

  let initialLoved: string[] = [];
  if (username) {
    try {
      const set = await getUserLovedRecordings(username);
      initialLoved = [...set];
    } catch {
      // A failed loved-tracks fetch must not block the page; fall back to empty.
      initialLoved = [];
    }
  }

  const body = (
    <>
      {/* Site-wide announcement banner above the header. Suspended
          so a slow Redis read doesn't block the rest of the layout —
          the banner just no-ops on cold cache and the page paints
          without it, then it streams in once the read completes. */}
      <Suspense fallback={null}>
        <AnnouncementBanner />
      </Suspense>
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </>
  );

  if (!username) return body;

  return (
    <LovedTracksProvider initialLoved={initialLoved}>{body}</LovedTracksProvider>
  );
}
