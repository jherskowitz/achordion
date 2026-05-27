"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Admin-scope error boundary.
 *
 * Server-component throws anywhere under /admin/* surface here
 * instead of bubbling up to the root error fallback (which would
 * show the generic React production message and only the digest).
 *
 * We render:
 *   - The error's `message` when it exists (admin is gated, so
 *     leaking implementation detail to the admin alone is fine —
 *     it's a debugging surface, not user-facing).
 *   - The `digest` so we can map a screenshot back to the exact
 *     line in `vercel logs`.
 *   - A Try-again button that re-mounts the segment.
 *
 * `useEffect` also pipes the error through `console.error` so it
 * lands in Vercel runtime logs even if the user just closes the tab
 * without copying the digest.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(
      `[admin] page render threw: digest=${error.digest ?? "(none)"} message=${error.message ?? "(none)"}`,
      error,
    );
  }, [error]);

  return (
    <section className="space-y-4 py-8">
      <p className="text-muted-foreground text-xs tracking-wide uppercase">
        Admin · error
      </p>
      <h2 className="text-2xl font-semibold tracking-tight">
        Something went wrong rendering this admin page.
      </h2>
      {error.message ? (
        <p className="bg-muted text-foreground/90 rounded-md p-3 font-mono text-sm">
          {error.message}
        </p>
      ) : (
        <p className="text-muted-foreground text-sm">
          No client-visible message — check Vercel logs with the digest
          below.
        </p>
      )}
      {error.digest && (
        <p className="text-muted-foreground text-xs">
          digest: <code>{error.digest}</code>
        </p>
      )}
      <div className="flex flex-wrap gap-2 pt-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" nativeButton={false}>
          <a href="/admin">Back to Admin</a>
        </Button>
      </div>
    </section>
  );
}
