import type { ReactNode } from "react";
import { auth } from "@/auth";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
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
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </>
  );

  if (!username) return body;

  return (
    <LovedTracksProvider initialLoved={initialLoved}>{body}</LovedTracksProvider>
  );
}
