"use client";

import { useRouter } from "next/navigation";

/**
 * Shown when the artist discography fetch FAILS or times out — as opposed
 * to an artist who genuinely has no releases (that case keeps the
 * "No releases on file at MusicBrainz" copy in <Discography>). Collapsing
 * a transient MusicBrainz timeout into an empty list used to render the
 * wrong, sticky "no releases" message for artists who in fact have a full
 * catalog; this surfaces the failure honestly and offers a retry.
 *
 * The retry is a <button> (not a link) calling router.refresh() — the same
 * extension-safe pattern the filter pills use — which re-runs the route's
 * server components. A background revalidation or a healthy MusicBrainz on
 * the next request clears it.
 */
export function DiscographyLoadError() {
  const router = useRouter();
  return (
    <div className="text-muted-foreground flex flex-col items-start gap-2 text-sm">
      <p>Couldn’t load the discography just now — MusicBrainz didn’t respond in time.</p>
      <button
        type="button"
        onClick={() => router.refresh()}
        className="text-foreground hover:bg-muted rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
      >
        Retry
      </button>
    </div>
  );
}
