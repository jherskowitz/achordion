import { Suspense } from "react";
import { auth } from "@/auth";
import { getUserPins } from "@/lib/clients/listenbrainz";
import { indexPinMentionsFromList } from "@/lib/index-pin-mentions";
import { PinnedTrackCard } from "@/components/achordion/pinned-track-card";
import { PageShell } from "@/components/achordion/page-shell";
import { EmptyState } from "@/components/achordion/empty-state";
import { friendlyListenBrainzError } from "@/lib/upstream-error";
import { Skeleton } from "@/components/ui/skeleton";

interface PageParams {
  params: Promise<{ name: string }>;
}

async function PinsHistory({
  name,
  thankable,
}: {
  name: string;
  thankable: boolean;
}) {
  let pins;
  try {
    pins = await getUserPins(name, 50);
    // Fire-and-forget: scan each pin's blurb for @mentions and
    // fan-out into the mention-index so mentioned users see this
    // pin in their /feed. No await — the render returns
    // immediately; the Upstash writes happen in the background.
    void indexPinMentionsFromList(pins, name);
  } catch (err) {
    return (
      <EmptyState
        title="Couldn't load pins"
        description={friendlyListenBrainzError(err)}
      />
    );
  }

  if (pins.length === 0) {
    return (
      <EmptyState
        title="No pins yet"
        description={`${name} hasn't pinned a recording.`}
      />
    );
  }

  // Each card streams its own external-links row in via Suspense —
  // no per-page parallel fetch needed, the React renderer fans out
  // the per-card MB requests concurrently.
  //
  // Server component: Date.now() is request-time, not a re-render
  // hazard — purity rule doesn't apply.
  // eslint-disable-next-line react-hooks/purity
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
                thankable={thankable}
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
                thankable={thankable}
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
  const session = await auth();
  const viewer = session?.user?.mbUsername ?? null;
  const thankable = !!viewer && viewer.toLowerCase() !== name.toLowerCase();
  return (
    <PageShell className="pt-8">
      <h2 className="mb-6 text-sm font-semibold tracking-wide uppercase">
        Pins
      </h2>
      <Suspense fallback={<Fallback />}>
        <PinsHistory name={name} thankable={thankable} />
      </Suspense>
    </PageShell>
  );
}
