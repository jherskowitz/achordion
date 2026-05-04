"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const rateLimited = error.digest === "MB_RATE_LIMITED";

  return (
    <section className="mx-auto flex max-w-2xl flex-col items-start gap-6 px-4 py-24 sm:px-6">
      <p className="text-muted-foreground text-sm tracking-wide uppercase">
        {rateLimited ? "Slow down a sec" : "Something went wrong"}
      </p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        {rateLimited
          ? "We're being rate-limited by MusicBrainz."
          : "We hit a snag loading this page."}
      </h1>
      <p className="text-muted-foreground">
        {rateLimited ? (
          <>
            MusicBrainz is the open music database powering most of Achordion,
            and it caps requests at one per second. Try again in a few seconds
            — once cached, repeat visits don&apos;t hit this limit.
          </>
        ) : (
          <>
            This usually means an upstream music data API is rate-limiting us
            or briefly unreachable. Try again in a moment.
          </>
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={reset}>Try again</Button>
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
