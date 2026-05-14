"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // The browser-side React render is also pending while reset() runs;
  // track that separately so the spinner stays up across both phases.
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    console.error(error);
  }, [error]);

  // Both upstream APIs ship a rate-limit-tagged Error; we treat them
  // the same in the UI (the "what is this service" sentence picks the
  // right name based on the digest).
  const mbRateLimited = error.digest === "MB_RATE_LIMITED";
  const lbRateLimited = error.digest === "LB_RATE_LIMITED";
  const rateLimited = mbRateLimited || lbRateLimited;
  const rateLimitedService = lbRateLimited ? "ListenBrainz" : "MusicBrainz";

  function handleRetry() {
    // `reset()` alone re-renders the error boundary's children, but
    // Next's data cache still holds whatever state caused the throw —
    // so the same upstream call returns the same cached error and the
    // boundary catches it again with no visible change. `router.refresh()`
    // invalidates the segment's cached data and re-runs server
    // components, so the next reset() actually re-fetches.
    setRefreshing(true);
    startTransition(() => {
      router.refresh();
      reset();
    });
    // Clear the spinner after a short floor — the transition finishes
    // when the new server response paints, and we don't want to leave
    // the button locked if the new render also errors (the boundary
    // remounts with `pending=false` anyway, but belt-and-braces).
    setTimeout(() => setRefreshing(false), 1500);
  }

  const isRetrying = pending || refreshing;

  return (
    <section className="mx-auto flex max-w-2xl flex-col items-start gap-6 px-4 py-24 sm:px-6">
      <p className="text-muted-foreground text-sm tracking-wide uppercase">
        {rateLimited ? "Slow down a sec" : "Something went wrong"}
      </p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        {rateLimited
          ? `We're being rate-limited by ${rateLimitedService}.`
          : "We hit a snag loading this page."}
      </h1>
      <p className="text-muted-foreground">
        {rateLimited ? (
          <>
            {rateLimitedService} is one of the open music services powering
            Achordion. It caps how often any one client can hit it — try again
            in a few seconds. Once a page is cached, repeat visits don&apos;t
            hit this limit.
          </>
        ) : (
          <>
            This usually means an upstream music data API is rate-limiting us
            or briefly unreachable. Try again in a moment.
          </>
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={handleRetry} disabled={isRetrying}>
          {isRetrying ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Retrying…
            </>
          ) : (
            "Try again"
          )}
        </Button>
        <Button variant="outline" nativeButton={false} render={<Link href="/" />}>
          Back to home
        </Button>
      </div>
      {error.digest ? (
        <p className="text-muted-foreground text-xs">
          Error reference: <code>{error.digest}</code>
        </p>
      ) : null}
    </section>
  );
}
