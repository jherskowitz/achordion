"use client";

import { useQuery } from "@tanstack/react-query";
import { faviconUrl } from "@/lib/favicon";
import { canonicalHost } from "@/lib/host";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { AddSourcesButton } from "./add-sources-button";

/**
 * Streaming-favicon row for entity pages — the per-track Spotify /
 * Apple Music / Bandcamp / etc. tile strip you click to play.
 *
 * Built for the "shared link" path: someone in Parachord shares an
 * Achordion track URL to a friend who doesn't have Parachord, the
 * friend lands on `/recording/<mbid>`, and we want them able to
 * click a streaming service and play <em>immediately</em>, not after
 * a 3-second Odesli round-trip on a cold MBID.
 *
 * Two-phase rendering:
 *   1. **Initial paint (server-rendered):** whatever MusicBrainz
 *      url-rels we already have for the recording, rendered as
 *      clickable favicons. Cost is zero — we already fetched the
 *      recording for the page header. So even on a cold MBID the
 *      friend sees Bandcamp / Apple Music / etc. (whichever MB has)
 *      on first paint and can click through.
 *   2. **Upgrade (client-side):** on mount, fetch
 *      `/api/track-links?mbid=...` to get the full cache-resolved /
 *      Odesli-enriched set. Merge by canonical host (so MB-rendered
 *      tiles don't double up with the same service from Odesli) and
 *      render the union. The cache hit is the common case (CDN
 *      `s-maxage=86400`); on miss the API resolves Odesli and writes
 *      back, so the second visitor benefits.
 *
 * Why a client island rather than awaiting on the server: the
 * Odesli enrichment can be slow on the first cold MBID; a server-
 * await leaves the row empty (or in a Suspense subtree swap that
 * unmounts the MB tiles when full data lands). A client island with
 * a server seed keeps the MB tiles mounted across the upgrade —
 * smooth React reconciliation, no flicker.
 */

interface ResolvedLink {
  url: string;
  label: string;
  host: string;
}

type LinkEntity = "recording" | "release-group";

interface StreamingLinksRowProps {
  /** Recording or release-group MBID — used as the cache key for
   *  /api/track-links. */
  mbid: string;
  /** Which entity `mbid` refers to. Drives the cache namespace and
   *  the entity-aware MB fetch on the API side. */
  entity: LinkEntity;
  /** MB url-rels (or any pre-resolved links) the server has on hand.
   *  Rendered immediately on first paint so the row is clickable
   *  before the client fetch lands. Pass `[]` if nothing's available
   *  — the row will paint empty and the client fetch will fill it. */
  initialItems: ResolvedLink[];
  /** Optional Odesli seed override. The API route falls back to the
   *  first MB streaming rel when omitted, which is what we want in
   *  the common case. */
  seedUrl?: string | null;
}

export function StreamingLinksRow({
  mbid,
  entity,
  initialItems,
  seedUrl,
}: StreamingLinksRowProps) {
  const { data } = useQuery<{ links: ResolvedLink[] }>({
    queryKey: ["track-links", entity, mbid, seedUrl ?? null],
    queryFn: async () => {
      const params = new URLSearchParams({ mbid, entity });
      if (seedUrl) params.set("seedUrl", seedUrl);
      const r = await fetch(`/api/track-links?${params.toString()}`);
      if (!r.ok) throw new Error(`track-links ${r.status}`);
      return r.json();
    },
    // A track's link set keeps growing over its first ~15 min of life
    // (Parachord submit → Odesli merge → name back-fill), so an
    // infinite staleTime froze the row at whatever subset it first
    // resolved until a full reload. Match the API's 5-min cache: the
    // row self-heals on revisit/remount once stale, while staying
    // instant on first paint. Window-focus refetch stays off to avoid
    // refetch storms on tab switches.
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Merge: prefer the server-resolved set (which has full Odesli
  // enrichment + cache writes) once it arrives, falling back to the
  // MB-only initial set until then. Dedupe by canonical host so a
  // server-rendered MB tile and a client-fetched Odesli tile for
  // the same service don't double up.
  const items = data?.links && data.links.length > 0
    ? mergeByHost(initialItems, data.links)
    : initialItems;

  // Always render the row when we have an MBID — even with zero
  // resolved items the "+ Add sources" tile gives editors a path to
  // wire up streaming services on MB. Returning null here was the
  // regression that hid favicon rows on obscure recordings (no MB
  // url-rels, nothing cached, Odesli empty).
  return (
    <ul className="flex flex-wrap items-center gap-2" role="list">
      {items.map((it) => (
        <FaviconTile key={it.url} url={it.url} label={it.label} host={it.host} />
      ))}
      <li>
        <AddSourcesButton mbEntity={entity} mbid={mbid} />
      </li>
    </ul>
  );
}

/**
 * Right-bias merge: incoming wins on host conflicts. Order follows
 * incoming first, then any existing entries whose host wasn't seen
 * in incoming (preserves MB-only services like Bandcamp at the end
 * of the row when the client fetch returned the canonical set).
 */
function mergeByHost(
  existing: ResolvedLink[],
  incoming: ResolvedLink[],
): ResolvedLink[] {
  const seen = new Set<string>();
  const out: ResolvedLink[] = [];
  for (const link of incoming) {
    const k = canonicalHost(link.host);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(link);
  }
  for (const link of existing) {
    const k = canonicalHost(link.host);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(link);
  }
  return out;
}

function FaviconTile({
  url,
  label,
  host,
}: {
  url: string;
  label: string;
  host: string;
}) {
  return (
    <li>
      <IconTooltip label={label}>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          suppressHydrationWarning
          className="border-border/60 hover:border-foreground/40 hover:bg-muted/40 inline-flex size-9 items-center justify-center rounded-md border transition-colors pointer-coarse:size-11"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={faviconUrl(host)}
            alt=""
            width={16}
            height={16}
            loading="lazy"
            className="size-4 opacity-80 hover:opacity-100"
          />
        </a>
      </IconTooltip>
    </li>
  );
}
