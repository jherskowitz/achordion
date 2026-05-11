import { getActiveAnnouncementsFor } from "@/lib/announcements";
import { AnnouncementBannerClient } from "./announcement-banner-client";

/**
 * Site-wide announcement banner.
 *
 * Server-fetches the active (non-expired, achordion-surface)
 * announcements out of the shared Upstash store, then hands them to
 * a client island that picks the first non-dismissed entry, renders
 * the banner, and remembers dismissals in localStorage.
 *
 * Renders nothing when there's no active announcement, so the slot
 * is a no-op (zero DOM, no flicker) in steady state.
 *
 * Admin workflow:
 *
 *   redis> SET announcements:json '[{"id":"downtime-2026-05-11","title":"Scheduled maintenance Tuesday 2am UTC","severity":"warn","body":"Listening data may be unavailable for ~10 minutes.","surfaces":["achordion"],"expiresAt":"2026-05-13T00:00:00Z"}]'
 *
 * Bump the `id` (e.g. add `-v2`) to force a re-show after editing
 * — dismissals key off the id so the same id stays dismissed for
 * users who'd already closed it.
 */
export async function AnnouncementBanner() {
  const items = await getActiveAnnouncementsFor("achordion");
  if (items.length === 0) return null;
  return <AnnouncementBannerClient items={items} />;
}
