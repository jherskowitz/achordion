import { CacheBustForm } from "./cache-bust-form";

export const metadata = { title: "Cache · Admin" };

/**
 * Manual MB / LB cache-bust controls.
 *
 * Most cache invalidation happens automatically (edit/delete actions
 * call `revalidateTag`, tag votes do the same). This page exists for
 * the edge case where a slot is stale and there's no natural trigger
 * — e.g. someone voted before the revalidate-on-vote fix shipped,
 * or a MusicBrainz edit was performed directly on musicbrainz.org.
 *
 * Server action `revalidateMbEntity` does the actual work; this page
 * is just a thin form over it.
 */
export default function CacheAdminPage() {
  return (
    <div className="space-y-4 text-sm leading-6">
      <p className="text-muted-foreground">
        Bust a cached MusicBrainz response by entity + MBID. Use when
        a page shows stale data (missing tags, old title, etc.) and
        the auto-revalidate window hasn&apos;t expired yet.
      </p>
      <CacheBustForm />
    </div>
  );
}
