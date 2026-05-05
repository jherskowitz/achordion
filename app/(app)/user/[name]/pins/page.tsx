import { Suspense } from "react";
import { getUserPins } from "@/lib/clients/listenbrainz";
import {
  getRecording,
  partitionArtistRelations,
  type ArtistExternalLink,
} from "@/lib/clients/musicbrainz";
import { categoriseLinks } from "@/components/achordion/external-links";
import { PinnedTrackCard } from "@/components/achordion/pinned-track-card";
import { PageShell } from "@/components/achordion/page-shell";
import { ComingSoon } from "@/components/achordion/coming-soon";
import { Skeleton } from "@/components/ui/skeleton";

interface PageParams {
  params: Promise<{ name: string }>;
}

async function PinsHistory({ name }: { name: string }) {
  let pins;
  try {
    pins = await getUserPins(name, 50);
  } catch (err) {
    return (
      <ComingSoon
        title="Couldn't load pins"
        description={err instanceof Error ? err.message : ""}
      />
    );
  }

  if (pins.length === 0) {
    return (
      <ComingSoon
        title="No pins yet"
        description={`${name} hasn't pinned a recording.`}
      />
    );
  }

  // Parallel-fetch each pin's MB recording so the favicon row on every
  // card is consistent with the recording-page row. getRecording is
  // cached + rate-limited at the client; per-pin failure quietly drops
  // that card's favicon row (the card still renders).
  const linksByPin = new Map<number, ArtistExternalLink[]>();
  await Promise.all(
    pins.map(async (p) => {
      const mbid =
        p.track_metadata.mbid_mapping?.recording_mbid ??
        p.track_metadata.additional_info?.recording_mbid ??
        p.recording_mbid ??
        null;
      if (!mbid) return;
      const recording = await getRecording(mbid).catch(() => null);
      if (!recording) return;
      const { urls } = partitionArtistRelations({
        relations: recording.relations,
      });
      linksByPin.set(p.row_id, categoriseLinks(urls).streaming);
    }),
  );

  const now = Math.floor(Date.now() / 1000);
  const active = pins.filter((p) => p.pinned_until > now);
  const past = pins.filter((p) => p.pinned_until <= now);

  return (
    <div className="space-y-10">
      {active.length > 0 && (
        <section>
          <h3 className="text-muted-foreground mb-3 text-xs tracking-wide uppercase">
            Currently pinned
          </h3>
          <div className="space-y-3">
            {active.map((p) => (
              <PinnedTrackCard
                key={p.row_id}
                pin={p}
                streamingLinks={linksByPin.get(p.row_id) ?? []}
              />
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h3 className="text-muted-foreground mb-3 text-xs tracking-wide uppercase">
            Past pins
            <span className="text-muted-foreground/60 ml-2 text-xs normal-case tracking-normal">
              {past.length}
            </span>
          </h3>
          <div className="space-y-3">
            {past.map((p) => (
              <PinnedTrackCard
                key={p.row_id}
                pin={p}
                streamingLinks={linksByPin.get(p.row_id) ?? []}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Fallback() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="border-border/60 flex gap-4 rounded-2xl border p-4"
        >
          <Skeleton className="size-20 shrink-0 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function PinsPage({ params }: PageParams) {
  const { name } = await params;
  return (
    <PageShell className="pt-8">
      <h2 className="mb-6 text-sm font-semibold tracking-wide uppercase">
        Pins
      </h2>
      <Suspense fallback={<Fallback />}>
        <PinsHistory name={name} />
      </Suspense>
    </PageShell>
  );
}
