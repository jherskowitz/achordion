import { Suspense } from "react";
import { getLbRadio } from "@/lib/clients/listenbrainz";
import { PageShell } from "@/components/achordion/page-shell";
import { LbRadioSection } from "@/components/achordion/lb-radio-section";
import {
  StationBuilder,
  type RadioMode,
} from "@/components/achordion/station-builder";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Radio" };

interface PageProps {
  searchParams: Promise<{ prompt?: string; mode?: string }>;
}

const MODES: RadioMode[] = ["easy", "medium", "hard"];

function parseMode(v: string | undefined): RadioMode {
  return MODES.includes(v as RadioMode) ? (v as RadioMode) : "easy";
}

async function StationResults({
  prompt,
  mode,
}: {
  prompt: string;
  mode: RadioMode;
}) {
  const tracks = await getLbRadio(prompt, mode);
  if (!tracks) {
    return (
      <p className="text-muted-foreground text-sm">
        Couldn&apos;t generate this station. Either the prompt didn&apos;t
        resolve to anything, or LB Radio needs your token (add one in
        Settings → Connections).
      </p>
    );
  }
  if (tracks.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        ListenBrainz returned no tracks for{" "}
        <code className="bg-muted/70 rounded px-1 py-0.5">{prompt}</code>{" "}
        on {mode} mode. Try a different tag, mode, or seed.
      </p>
    );
  }
  return (
    <LbRadioSection
      seedLabel={prompt}
      tracks={tracks}
      refillUrl={radioRefillUrl(prompt, mode)}
    />
  );
}

function radioRefillUrl(prompt: string, mode: RadioMode): string {
  const params = new URLSearchParams({ prompt, mode });
  return `https://api.listenbrainz.org/1/explore/lb-radio?${params}`;
}

function ResultsSkeleton() {
  return (
    <div className="border-border/60 rounded-2xl border p-5">
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/4" />
        </div>
        <Skeleton className="h-8 w-24 rounded-lg" />
      </div>
    </div>
  );
}

export default async function RadioPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const prompt = sp.prompt?.trim() ?? "";
  const mode = parseMode(sp.mode);
  const hasPrompt = prompt.length > 0;

  return (
    <PageShell className="pt-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Radio
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Build a ListenBrainz Radio station from tags, artists, or
          countries — then play it in Parachord.
        </p>
      </header>

      <StationBuilder prompt={prompt} mode={mode} />

      {hasPrompt && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold tracking-wide uppercase">
            Your station
          </h2>
          <Suspense
            key={`${prompt}-${mode}`}
            fallback={<ResultsSkeleton />}
          >
            <StationResults prompt={prompt} mode={mode} />
          </Suspense>
        </section>
      )}
    </PageShell>
  );
}
