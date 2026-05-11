import { NextResponse } from "next/server";
import { loadAllAnnouncements } from "@/lib/announcements";

/**
 * Public announcements feed.
 *
 * Used by Parachord-desktop (and any other Parachord client that
 * adopts the same shape) to render in-app banner notifications. The
 * endpoint is intentionally **unauthenticated**: announcements are
 * broadcasts to every install, and gating them behind a token would
 * just be ceremony — the URL is hardcoded in the desktop binary, not
 * user-typed.
 *
 * Storage + schema documentation: see `lib/announcements.ts`.
 * This route hands back the FULL validated list — Parachord-desktop
 * applies its own `minVersion` / `maxVersion` + surface filtering
 * client-side. Achordion's own banner uses the surface-scoped
 * helpers in `lib/announcements.ts` directly (no roundtrip through
 * this route).
 *
 * Cache: `s-maxage=60, stale-while-revalidate=600`. Edits propagate
 * to clients within ~60s worst case while keeping reads at zero
 * origin cost in steady state. Tighten the TTLs if you ever want a
 * push-style "this is urgent, show now" lever.
 */

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const items = await loadAllAnnouncements();
  return NextResponse.json(items, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=600",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
