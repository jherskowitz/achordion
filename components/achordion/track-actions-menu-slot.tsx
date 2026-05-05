"use client";

import { useSession } from "next-auth/react";
import { TrackActionsMenu, type TrackRef } from "./track-actions-menu";

/**
 * Thin client wrapper that fetches the current viewer via
 * `useSession()` and renders `<TrackActionsMenu>`. Lets server-rendered
 * track rows drop the menu in without forcing the parent page to
 * dynamic-render via `auth()` (which would defeat edge caching).
 *
 * Returns `null` for guests — same posture as `<TrackActionsMenu>`,
 * just hoisted up so we can avoid mounting the menu's React Query
 * machinery for signed-out viewers.
 */
export function TrackActionsMenuSlot({ track }: { track: TrackRef }) {
  const { data: session } = useSession();
  const viewerName = session?.user?.mbUsername;
  if (!viewerName) return null;
  return <TrackActionsMenu track={track} viewer={{ mbUsername: viewerName }} />;
}
