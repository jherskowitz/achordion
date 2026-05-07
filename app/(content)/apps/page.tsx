import { PageShell } from "@/components/achordion/page-shell";
import { PageHeader } from "@/components/achordion/page-header";
import { LbClientMarketplace } from "@/components/achordion/lb-client-marketplace";

export const metadata = { title: "App Marketplace" };
// See app/(content)/layout.tsx for the static-rendering rationale.
export const revalidate = 86400;

export default function AppsPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="App Marketplace"
        title="Scrobblers + players that talk to ListenBrainz"
        description="Achordion shows you everything that's been scrobbled to your ListenBrainz account — but it doesn't actually play music or capture listens itself. These third-party apps do, across every platform. Pick whichever fits the music sources and devices you already use."
      />

      <div className="max-w-2xl space-y-12 pb-12">
        <LbClientMarketplace />
      </div>
    </PageShell>
  );
}
