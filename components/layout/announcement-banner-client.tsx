"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { Announcement } from "@/lib/announcements";

const DISMISS_STORAGE_KEY = "achordion.announcement-dismissed";

/** Read the dismissed-id set out of localStorage. Stored as a
 *  comma-separated list of ids — small enough that a Set isn't
 *  worth its overhead, and trivial to inspect / clear via DevTools.
 */
function readDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(DISMISS_STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(raw.split(",").filter(Boolean));
  } catch {
    return new Set();
  }
}

function persistDismissed(ids: Set<string>) {
  try {
    window.localStorage.setItem(
      DISMISS_STORAGE_KEY,
      Array.from(ids).join(","),
    );
  } catch {
    // localStorage write failed (private mode, quota, etc.) — dismiss
    // still works for this render; it just re-appears on reload.
  }
}

const SEVERITY_CLASSES: Record<
  NonNullable<Announcement["severity"]> | "info",
  string
> = {
  info: "bg-primary/10 text-primary border-primary/20",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  warn: "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/20",
  error: "bg-destructive/10 text-destructive border-destructive/30",
};

/**
 * Renders the first non-dismissed announcement out of the list.
 *
 * Strategy is "one at a time" — banners pile up visually if we
 * render them all, and the most-recent / highest-priority one is
 * usually what matters. The store's natural order wins (admin
 * controls priority by ordering the JSON array).
 *
 * Dismissal is per-id, persisted to localStorage. A re-published
 * announcement with the same id stays dismissed; bump the id (e.g.
 * `downtime-2026-05-11` → `downtime-2026-05-11-v2`) to force a
 * re-show after edit.
 *
 * The server-side `<AnnouncementBanner>` wrapper feeds us the
 * already-filtered list (surface-scoped + non-expired), so this
 * component is a thin client-only "render + dismiss" island.
 */
export function AnnouncementBannerClient({
  items,
}: {
  items: Announcement[];
}) {
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    // SSR-friendly: read localStorage only after mount so the first
    // paint matches the server-rendered banner. Some flicker is
    // acceptable here — the banner becomes hidden a tick later if
    // the user dismissed it on a previous visit. Both setState
    // calls intentionally happen inside the mount effect (the lint
    // rule conservatively flags them).
    /* eslint-disable react-hooks/set-state-in-effect */
    setDismissed(readDismissed());
    setMounted(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Pick the first non-dismissed item. SSR pass (mounted=false)
  // ignores localStorage entirely so the banner always renders on
  // first paint — better default than blanking the slot and
  // flashing in.
  const visible = mounted
    ? items.find((a) => !dismissed.has(a.id))
    : items[0];
  if (!visible) return null;

  const severity = visible.severity ?? "info";
  const tone = SEVERITY_CLASSES[severity];

  function dismiss() {
    if (!visible) return;
    const next = new Set(dismissed);
    next.add(visible.id);
    setDismissed(next);
    persistDismissed(next);
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`border-b ${tone}`}
    >
      <div className="mx-auto flex max-w-7xl items-start gap-3 px-4 py-2 text-sm sm:px-6">
        {visible.icon && (
          <span aria-hidden className="shrink-0 text-base leading-5">
            {visible.icon}
          </span>
        )}
        {!visible.icon && visible.iconUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={visible.iconUrl}
            alt=""
            width={20}
            height={20}
            referrerPolicy="no-referrer"
            className="size-5 shrink-0 rounded-sm"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium">{visible.title}</p>
          {visible.body && (
            <p className="mt-0.5 text-xs opacity-80 leading-5">
              {visible.body}
            </p>
          )}
        </div>
        {visible.cta && (
          <a
            href={visible.cta.url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline shrink-0 self-center text-xs font-medium underline-offset-4"
          >
            {visible.cta.label} →
          </a>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss announcement"
          className="hover:bg-foreground/10 -my-1 -mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
