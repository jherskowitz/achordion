import { PageShell } from "@/components/achordion/page-shell";
import { ComingSoon } from "@/components/achordion/coming-soon";

export const metadata = { title: "Spotify charts" };

export default function SpotifyChartsPage() {
  return (
    <PageShell className="pt-8">
      <ComingSoon
        title="Spotify charts"
        description="Spotify publishes the daily Top 50 globally and per-region as a public dataset. Wiring up the ingestion is on the punch list — meanwhile use the Apple Music tab for current top-played data."
      />
    </PageShell>
  );
}
