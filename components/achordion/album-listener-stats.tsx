"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  EntityHeaderStats,
  EntityHeaderStatsSkeleton,
} from "./entity-header-stats";
import { UserAvatar } from "./user-avatar";
import { LiveOnAirIndicator } from "./live-on-air-indicator";

/**
 * Client island for a release-group's listener stats (header counts +
 * sidebar Top Listeners).
 *
 * Why a client island: the LB stats call behind these
 * (`getReleaseGroupListeners`) can be slow or hang, and the
 * `/release-group/[mbid]` page is CDN-cached — so when this rendered
 * server-side, a hung LB call wedged the whole page render (stuck
 * skeleton). Fetching post-hydration from the cacheable
 * `/api/release-group/[mbid]/listeners` endpoint keeps LB off the
 * render path: the page paints immediately and the stats fill in (or
 * quietly don't) without ever blocking it.
 *
 * The per-row "on air" indicator uses the *client* `LiveOnAirIndicator`
 * (polls `/api/user/{u}/playing-now`) rather than the async-server
 * `OnAirIndicator`, since an async server component can't render inside
 * a client island.
 *
 * `AlbumHeaderStats` and `AlbumTopListeners` share one React Query key
 * so both mount points resolve from a single fetch.
 */

interface ListenersPayload {
  totalListens: number | null;
  totalListeners: number | null;
  listeners: Array<{ user_name: string; listen_count: number }>;
  bskyAvatars: Record<string, string>;
}

function useListenerStats(mbid: string) {
  return useQuery<ListenersPayload>({
    queryKey: ["release-group-listeners", mbid],
    queryFn: async () => {
      const r = await fetch(
        `/api/release-group/${encodeURIComponent(mbid)}/listeners`,
        { credentials: "same-origin" },
      );
      if (!r.ok) throw new Error(`listeners ${r.status}`);
      return r.json();
    },
    // Listener stats shift slowly + the endpoint is edge-cached; once
    // loaded, treat as good for the session.
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });
}

/** Header listens/listeners counts. Skeleton while loading; renders
 *  nothing if the album has no stats. */
export function AlbumHeaderStats({ mbid }: { mbid: string }) {
  const { data, isLoading, error } = useListenerStats(mbid);
  if (isLoading) return <EntityHeaderStatsSkeleton />;
  if (error || !data) return null;
  return (
    <EntityHeaderStats
      totalListens={data.totalListens ?? undefined}
      totalListeners={data.totalListeners ?? undefined}
    />
  );
}

/** Sidebar Top Listeners. Renders nothing while loading or when the
 *  album has no listener data (keeps the sidebar from teasing an empty
 *  section). Mirrors the "stack" layout of `TopListenersList`. */
export function AlbumTopListeners({ mbid }: { mbid: string }) {
  const { data } = useListenerStats(mbid);
  const avatars = useMemo(
    () => new Map(Object.entries(data?.bskyAvatars ?? {})),
    [data?.bskyAvatars],
  );
  const listeners = data?.listeners ?? [];
  if (listeners.length === 0) return null;
  const max = listeners[0]?.listen_count ?? 1;
  return (
    <div>
      <h2 className="text-muted-foreground mb-3 text-xs tracking-wide uppercase">
        Top listeners
      </h2>
      <ol className="space-y-1.5">
        {listeners.map((l, i) => {
          const pct = Math.round((l.listen_count / max) * 100);
          return (
            <li
              key={l.user_name}
              className="hover:bg-muted/40 -mx-2 rounded-md px-2 py-1.5 text-sm"
            >
              <Link
                href={`/user/${encodeURIComponent(l.user_name)}`}
                prefetch={false}
                className="block"
              >
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground/70 w-4 shrink-0 text-xs tabular-nums">
                    {i + 1}
                  </span>
                  <UserAvatar
                    username={l.user_name}
                    imageUrl={avatars.get(l.user_name.toLowerCase())}
                    className="size-6 shrink-0"
                    fallbackClassName="text-[10px]"
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {l.user_name}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {l.listen_count.toLocaleString()}
                  </span>
                </div>
                <div className="bg-muted mt-1.5 ml-6 h-0.5 overflow-hidden rounded-full">
                  <div
                    className="bg-foreground/60 h-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </Link>
              {/* Client on-air (polls playing-now) — aligned under the
                  avatar like the server list did. */}
              <LiveOnAirIndicator
                username={l.user_name}
                initialListen={null}
                size="compact"
                className="ml-6"
              />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
