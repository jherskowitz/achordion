/**
 * Small badge overlay for cover-art tiles, marking the release-group
 * type ("Album" / "EP"). Used on grids that intermingle types — the
 * artist-page "Albums + EPs" view, the recording-page "Also appears
 * on" section — so users can scan formats at a glance without reading
 * the meta line.
 *
 * Renders nothing for any other primary-type so we don't clutter
 * single-type buckets ("Albums" view shouldn't have an "Album" chip
 * on every card — the section header already says so).
 *
 * Caller is responsible for the surrounding `relative` cover wrapper.
 */
export function ReleaseTypeChip({ type }: { type: string | null | undefined }) {
  if (type !== "Album" && type !== "EP") return null;
  return (
    <span
      aria-hidden
      className="bg-foreground/85 text-background pointer-events-none absolute top-2 left-2 inline-flex h-5 items-center rounded-full px-2 text-[10px] font-semibold tracking-wide uppercase"
    >
      {type}
    </span>
  );
}
