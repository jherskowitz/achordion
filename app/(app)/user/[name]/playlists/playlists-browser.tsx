"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Loader2, Search } from "lucide-react";
import type {
  LbPlaylistSummary,
  LbRadioTrack,
  UserPlaylistsPage,
} from "@/lib/clients/listenbrainz";
import { PlaylistCard } from "@/components/achordion/playlist-card";
import { EmptyState } from "@/components/achordion/empty-state";
import { friendlyListenBrainzError } from "@/lib/upstream-error";
import { cn } from "@/lib/utils";

// Inline copy of `playlistMbidFromIdentifier` from the LB client.
// Importing the function from `lib/clients/listenbrainz.ts` (even
// alongside type-only imports) drags the whole module — including its
// `import "server-only"` chain via `lib/lb-token.ts` — into the client
// bundle, which Next 16 hard-rejects at build time. Type imports get
// stripped by tsc, so they're safe; runtime imports aren't.
function playlistMbidFromIdentifier(
  identifier: string | undefined | null,
): string | null {
  if (!identifier) return null;
  const m = identifier.match(/\/playlist\/([0-9a-f-]{36})/i);
  return m?.[1] ?? null;
}

const JSPF_PLAYLIST_KEY = "https://musicbrainz.org/doc/jspf#playlist";

/**
 * Module-level concurrency limiter for the preview fetch.
 *
 * Each `<PlaylistCardLazy>` fires one preview fetch when it scrolls
 * into view. A user scrolling fast through 100 cards used to fan out
 * to 100 parallel `/api/playlist/<mbid>/preview` requests, which —
 * even with the server-side tagged cache — caused a wave of cold-
 * cache LB calls that tripped LB's 1-req/sec rate-limit and bubbled
 * back as 502 errors on our route. Vercel alerts caught it: 1.8k
 * requests / 5 min from a single IP, ~5% LB 429s.
 *
 * Cap concurrent fetches at PREVIEW_MAX_INFLIGHT. Subsequent cards
 * wait their turn. The cap is generous enough that a normal scroll
 * still feels instant (one card resolves, the next slot opens) while
 * still capping the worst-case parallel pressure on LB.
 */
const PREVIEW_MAX_INFLIGHT = 3;
let previewInFlight = 0;
const previewQueue: Array<() => void> = [];

function acquirePreviewSlot(): Promise<void> {
  if (previewInFlight < PREVIEW_MAX_INFLIGHT) {
    previewInFlight++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    previewQueue.push(() => {
      previewInFlight++;
      resolve();
    });
  });
}

function releasePreviewSlot() {
  previewInFlight--;
  const next = previewQueue.shift();
  if (next) next();
}

/**
 * Sort options exposed on the playlists index. "Modified" uses
 * `extension.last_modified_at` (LB updates this on edit + track
 * add/remove); "Created" uses the JSPF `date` field. Both fall back
 * to the other when one's missing so a partial dataset doesn't sort
 * to the bottom in a confusing way.
 *
 * Title sort is locale-aware so non-Latin titles order sensibly for
 * the viewer's language.
 */
const SORT_OPTIONS = [
  { value: "modified-desc", label: "Modified · newest" },
  { value: "modified-asc", label: "Modified · oldest" },
  { value: "created-desc", label: "Created · newest" },
  { value: "created-asc", label: "Created · oldest" },
  { value: "title-asc", label: "Title · A → Z" },
  { value: "title-desc", label: "Title · Z → A" },
] as const;

type SortKey = (typeof SORT_OPTIONS)[number]["value"];

type Visibility = "all" | "public" | "private";

const VISIBILITY_OPTIONS: Array<{ value: Visibility; label: string }> = [
  { value: "all", label: "All" },
  { value: "public", label: "Public" },
  { value: "private", label: "Private" },
];

/** Mirrors PlaylistCard's read: `ext.public === false` ⇒ private,
 *  anything else (including missing) ⇒ public. */
function isPublicEntry(entry: LbPlaylistSummary): boolean {
  const ext = entry.playlist.extension?.[JSPF_PLAYLIST_KEY];
  return ext?.public !== false;
}

function emptyMatchDescription({
  query,
  visibility,
  loaded,
  showLoadMoreHint,
}: {
  query: string;
  visibility: Visibility;
  loaded: number;
  showLoadMoreHint: boolean;
}): string {
  const scopeLabel =
    visibility === "all"
      ? null
      : visibility === "public"
        ? "public"
        : "private";
  const queryPart = query ? `"${query}"` : null;
  const subject =
    queryPart && scopeLabel
      ? `${scopeLabel} playlists matching ${queryPart}`
      : queryPart
        ? `playlists matching ${queryPart}`
        : `${scopeLabel} playlists`;
  if (showLoadMoreHint) {
    return `Nothing in the ${loaded} loaded playlists matched ${subject}. Load more to keep searching.`;
  }
  return `Nothing matched ${subject}.`;
}

function dateMs(entry: LbPlaylistSummary, prefer: "modified" | "created"): number {
  const p = entry.playlist;
  const ext = p.extension?.[JSPF_PLAYLIST_KEY];
  const modified = ext?.last_modified_at;
  const created = p.date;
  // Prefer the requested field; fall back to the other so playlists
  // missing one don't all stack at the bottom (LB doesn't always
  // populate `last_modified_at` on legacy entries).
  const primary = prefer === "modified" ? modified : created;
  const fallback = prefer === "modified" ? created : modified;
  for (const candidate of [primary, fallback]) {
    if (!candidate) continue;
    const t = Date.parse(candidate);
    if (!Number.isNaN(t)) return t;
  }
  return 0;
}

function sortPlaylists(
  list: LbPlaylistSummary[],
  key: SortKey,
): LbPlaylistSummary[] {
  const sorted = list.slice();
  switch (key) {
    case "modified-desc":
      sorted.sort((a, b) => dateMs(b, "modified") - dateMs(a, "modified"));
      break;
    case "modified-asc":
      sorted.sort((a, b) => dateMs(a, "modified") - dateMs(b, "modified"));
      break;
    case "created-desc":
      sorted.sort((a, b) => dateMs(b, "created") - dateMs(a, "created"));
      break;
    case "created-asc":
      sorted.sort((a, b) => dateMs(a, "created") - dateMs(b, "created"));
      break;
    case "title-asc":
      sorted.sort((a, b) =>
        a.playlist.title.localeCompare(b.playlist.title, undefined, {
          sensitivity: "base",
        }),
      );
      break;
    case "title-desc":
      sorted.sort((a, b) =>
        b.playlist.title.localeCompare(a.playlist.title, undefined, {
          sensitivity: "base",
        }),
      );
      break;
  }
  return sorted;
}

/**
 * Lazy-loaded mosaic cell.
 *
 * The playlist index pays one `getPlaylist` call per card to populate
 * its 2×2 cover mosaic. Eager-fetching all of them blows past LB's
 * 1 req/sec rate budget on profiles with many playlists, so we
 * IntersectionObserver-defer: a card's preview fetch fires only once
 * it scrolls within `rootMargin` of the viewport. Cached responses
 * land instantly; cold fetches show the mosaic skeleton until LB
 * responds.
 */
function PlaylistCardLazy({
  entry,
  hideCreatorIfMatches,
  isOwner = false,
}: {
  entry: LbPlaylistSummary;
  hideCreatorIfMatches?: string;
  isOwner?: boolean;
}) {
  const mbid = playlistMbidFromIdentifier(entry.playlist.identifier);
  const ref = useRef<HTMLLIElement>(null);
  const [tracks, setTracks] = useState<LbRadioTrack[] | "loading">("loading");
  // `started` keeps us from double-firing if the observer flips
  // intersecting → not → intersecting before the fetch resolves.
  const startedRef = useRef(false);

  useEffect(() => {
    if (!mbid) {
      setTracks([]);
      return;
    }
    if (!ref.current) return;
    const el = ref.current;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting || startedRef.current) continue;
          startedRef.current = true;
          io.disconnect();
          // Throttle through the module-level semaphore. Hundred
          // cards scrolling into view at once now queue behind 3 in-
          // flight fetches at a time rather than fanning out 100
          // parallel requests through to LB.
          acquirePreviewSlot()
            .then(() =>
              fetch(`/api/playlist/${encodeURIComponent(mbid)}/preview`, {
                credentials: "same-origin",
              }),
            )
            .then((r) => (r.ok ? r.json() : { tracks: [] }))
            .then((data: { tracks?: LbRadioTrack[] }) => {
              setTracks(data.tracks ?? []);
            })
            .catch(() => {
              // Network / 502 — render the empty-mosaic fallback
              // (disc-icon placeholder) so the card still shows up
              // with its title + metadata.
              setTracks([]);
            })
            .finally(releasePreviewSlot);
        }
      },
      // 300px rootMargin so the fetch fires slightly before the card
      // enters the viewport, hiding the skeleton flash for users who
      // scroll at a normal pace.
      { rootMargin: "300px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [mbid]);

  return (
    <li ref={ref}>
      <PlaylistCard
        entry={entry}
        hideCreatorIfMatches={hideCreatorIfMatches}
        isOwner={isOwner}
        tracks={tracks}
      />
    </li>
  );
}

interface PlaylistsBrowserProps {
  name: string;
  initial: UserPlaylistsPage;
  /** Self-view bypasses CDN cache on "Load more" — needed so newly-
   *  created private playlists surface immediately. */
  isSelf: boolean;
}

/**
 * Client island for the playlists index.
 *
 * Handles:
 *   - Filter (type-ahead substring match on title, case-insensitive)
 *   - Sort (modified / created / title, both directions)
 *   - Lazy track preview loading per visible card
 *   - Load-more pagination when the user has more than the initial
 *     fetch returned
 *
 * Server hands us the first batch (already includes private items
 * when self-viewing); subsequent batches come from
 * `/api/user/<name>/playlists`.
 */
export function PlaylistsBrowser({
  name,
  initial,
  isSelf,
}: PlaylistsBrowserProps) {
  const [items, setItems] = useState<LbPlaylistSummary[]>(initial.playlists);
  const [total, setTotal] = useState<number>(initial.total);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("modified-desc");
  // Visibility filter only matters when the viewer can see private
  // entries — anonymous / non-self loads never include them. Default
  // to "all" so the chip set is a noop until the user picks a filter.
  const [visibility, setVisibility] = useState<Visibility>("all");

  const loadMore = useCallback(async () => {
    if (loading) return;
    if (items.length >= total) return;
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({
        count: "100",
        offset: String(items.length),
      });
      const res = await fetch(
        `/api/user/${encodeURIComponent(name)}/playlists?${params}`,
        // Self-view bypasses any same-origin caching so newly-saved
        // private playlists become visible without a hard reload.
        { cache: isSelf ? "no-store" : "default" },
      );
      if (!res.ok) {
        throw new Error(`Load failed (${res.status})`);
      }
      const data = (await res.json()) as UserPlaylistsPage;
      // Dedupe by identifier — LB's offset windowing is honest, but
      // a race between client-side updates and the server response
      // could otherwise duplicate an entry.
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.playlist.identifier));
        const merged = prev.slice();
        for (const entry of data.playlists) {
          if (!seen.has(entry.playlist.identifier)) {
            merged.push(entry);
            seen.add(entry.playlist.identifier);
          }
        }
        return merged;
      });
      // LB's `total` can drift between paginated calls (new playlist
      // created mid-pagination). Trust the latest response.
      setTotal(data.total);
    } catch (err) {
      setLoadError(friendlyListenBrainzError(err));
    } finally {
      setLoading(false);
    }
  }, [loading, items.length, total, name, isSelf]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let result = items;
    if (visibility !== "all") {
      const wantPublic = visibility === "public";
      result = result.filter((entry) => isPublicEntry(entry) === wantPublic);
    }
    if (q) {
      result = result.filter((entry) => {
        const title = entry.playlist.title.toLowerCase();
        const ann = (entry.playlist.annotation ?? "").toLowerCase();
        return title.includes(q) || ann.includes(q);
      });
    }
    return sortPlaylists(result, sort);
  }, [items, query, sort, visibility]);

  const filtering = query.trim().length > 0 || visibility !== "all";
  const showLoadMoreHint =
    filtering && filtered.length === 0 && items.length < total;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative max-w-sm flex-1">
            <Search
              aria-hidden
              className="text-muted-foreground/70 pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter playlists…"
              aria-label="Filter playlists"
              className="border-border/60 bg-background placeholder:text-muted-foreground/60 focus:ring-foreground/20 block h-9 w-full rounded-md border pr-3 pl-8 text-sm outline-none focus:ring-2"
            />
          </div>
          {isSelf && (
            // Visibility pills — owner-only. Non-self viewers never
            // see private entries in the data set, so the filter
            // would just be an "All / Public / (empty Private)"
            // affordance with no use case.
            <div
              role="radiogroup"
              aria-label="Filter by visibility"
              className="border-border/60 bg-muted/20 inline-flex items-center rounded-md border p-0.5 text-xs"
            >
              {VISIBILITY_OPTIONS.map((opt) => {
                const active = visibility === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setVisibility(opt.value)}
                    className={cn(
                      "inline-flex h-7 items-center rounded px-3 transition-colors",
                      active
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <label className="text-muted-foreground inline-flex items-center gap-2 text-xs">
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="border-border/60 bg-background text-foreground h-9 rounded-md border px-2 text-sm"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {filtered.length === 0 && !filtering ? (
        <EmptyState
          title="No playlists yet"
          description={`${name} hasn't created any playlists.`}
        />
      ) : filtered.length === 0 && filtering ? (
        <EmptyState
          title="No matches"
          description={emptyMatchDescription({
            query: query.trim(),
            visibility,
            loaded: items.length,
            showLoadMoreHint,
          })}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filtered.map((entry) => (
            <PlaylistCardLazy
              key={entry.playlist.identifier}
              entry={entry}
              hideCreatorIfMatches={name}
              isOwner={isSelf}
            />
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between gap-3 pt-2">
        <p className="text-muted-foreground/70 text-xs">
          Showing {filtered.length.toLocaleString()}
          {filtering ? ` of ${items.length.toLocaleString()} loaded` : ""}
          {!filtering && total > items.length
            ? ` of ${total.toLocaleString()}`
            : ""}
          {!filtering && total === items.length && items.length > 0
            ? ` of ${total.toLocaleString()}`
            : ""}
          .
        </p>
        {items.length < total && (
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className={cn(
              "border-border/60 hover:bg-muted/40 inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs disabled:opacity-50",
            )}
          >
            {loading && <Loader2 className="size-3.5 animate-spin" />}
            {loading ? "Loading…" : "Load more"}
          </button>
        )}
      </div>

      {loadError && (
        <p className="text-destructive text-xs">{loadError}</p>
      )}
    </div>
  );
}
