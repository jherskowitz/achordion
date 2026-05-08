/**
 * Relative-time helper + `<RelativeTime>` component.
 *
 * The helper formats a unix-seconds timestamp as a human-friendly
 * relative string ("2h ago", "3d ago") relative to *now*. Because it
 * reads `Date.now()` implicitly during render, server-side and
 * client-side renders that straddle a minute / hour boundary produce
 * different strings — the canonical hydration mismatch for any
 * "X ago" UI.
 *
 * `<RelativeTime>` wraps the formatted string in an element with
 * `suppressHydrationWarning`, so React tolerates the SSR/CSR drift.
 * The visible text always reflects the client's clock once
 * hydrated, which is the more accurate value anyway.
 */

interface RelativeTimeProps {
  /** Unix seconds — the moment being described as "ago". */
  value: number;
  /** Render as `<time>` (with `dateTime` attr) instead of `<span>`.
   *  Use for actual timestamps the user might want a screen-reader
   *  to expose; spans are fine for inline narrative copy. */
  asTime?: boolean;
  className?: string;
}

export function RelativeTime({
  value,
  asTime = false,
  className,
}: RelativeTimeProps) {
  const text = relativeTime(value);
  if (asTime) {
    return (
      <time
        dateTime={new Date(value * 1000).toISOString()}
        className={className}
        suppressHydrationWarning
      >
        {text}
      </time>
    );
  }
  return (
    <span className={className} suppressHydrationWarning>
      {text}
    </span>
  );
}

/**
 * Format a unix-seconds timestamp as "Xs ago" / "Xm ago" / "Xh ago"
 * / "Xd ago" / a localised date once the gap is older than a week.
 *
 * Pure function — exported for callers that need the string itself
 * (e.g. inside a tooltip / aria-label) rather than the wrapping
 * component. Most UI should prefer `<RelativeTime>` so the
 * hydration-warning suppression lives in one place.
 */
export function relativeTime(unixSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - unixSeconds;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  const date = new Date(unixSeconds * 1000);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: now - unixSeconds > 86400 * 365 ? "numeric" : undefined,
  });
}

/**
 * Two-direction relative phrasing — "in Xm" / "Xm ago", used for
 * timestamps that can be in the future (pin expiry, scheduled
 * events) as well as the past. Same SSR-mismatch caveat as
 * `relativeTime`; wrap callers in `<RelativeTime>` or another
 * `suppressHydrationWarning` element when rendering.
 */
export function relativeFromNow(unixSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = unixSeconds - now;
  const abs = Math.abs(diff);
  if (abs < 60) return diff < 0 ? "just now" : "in seconds";
  if (abs < 3600) {
    const mins = Math.floor(abs / 60);
    return diff < 0 ? `${mins}m ago` : `in ${mins}m`;
  }
  if (abs < 86400) {
    const hrs = Math.floor(abs / 3600);
    return diff < 0 ? `${hrs}h ago` : `in ${hrs}h`;
  }
  const days = Math.floor(abs / 86400);
  return diff < 0 ? `${days}d ago` : `in ${days}d`;
}
