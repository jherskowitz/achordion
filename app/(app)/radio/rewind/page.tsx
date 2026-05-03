import { PageShell } from "@/components/achordion/page-shell";
import { RadioRewindGrid } from "@/components/achordion/radio-rewind-grid";

export const metadata = { title: "Radio Rewinds" };

export default function RadioRewindsPage() {
  return (
    <PageShell className="pt-8">
      <header className="mb-6">
        <h2 className="text-sm font-semibold tracking-wide uppercase">
          Radio Rewinds
        </h2>
        <p className="text-muted-foreground/80 mt-1 max-w-3xl text-sm">
          Daily-refreshed playlists of what public radio stations
          actually played in the last 24 hours. Sourced from{" "}
          <a
            href="https://github.com/jherskowitz/spinbin"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            spinbin
          </a>
          .
        </p>
      </header>
      <RadioRewindGrid />
    </PageShell>
  );
}
