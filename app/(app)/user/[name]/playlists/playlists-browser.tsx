"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Loader2, Search } from "lucide-react";
import {
  playlistMbidFromIdentifier,
  type LbPlaylistSummary,
  type LbRadioTrack,
  type UserPlaylistsPage,
} from "@/lib/clients/listenbrainz";
import { PlaylistCard } from "@/components/achordion/playlist-card";
import { EmptyState } from "@/components/achordion/empty-state";
import { cn } from "@/lib/utils";

const JSPF_PLAYLIST_KEY = "https://musicbrainz.org/doc/jspf#playlist";

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
}: {
  entry: LbPlaylistSummary;
  hideCreatorIfMatches?: string;
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
          fetch(`/api/playlist/${encodeURIComponent(mbid)}/preview`, {
            credentials: "same-origin",
          })
            .then((r) => (r.ok ? r.json() : { tracks: [] }))
            .then((data: { tracks?: LbRadioTrack[] }) => {
              setTracks(data.tracks ?? []);
            })
            .catch(() => {
              // Network / 502 — render the empty-mosaic fallback
              // (disc-icon placeholder) so the card still shows up
              // with its title + metadata.
              setTracks([]);
            });
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
      setLoadError(err instanceof Error ? err.message : "Couldn't load more.");
    } finally {
      setLoading(false);
    }
  }, [loading, items.length, total, name, isSelf]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let result = items;
    if (q) {
      result = result.filter((entry) => {
        const title = entry.playlist.title.toLowerCase();
        const ann = (entry.playlist.annotation ?? "").toLowerCase();
        return title.includes(q) || ann.includes(q);
      });
    }
    return sortPlaylists(result, sort);
  }, [items, query, sort]);

  const filtering = query.trim().length > 0;
  const showLoadMoreHint =
    filtering && filtered.length === 0 && items.length < total;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
          description={
            showLoadMoreHint
              ? `Nothing in the ${items.length} loaded playlists matched "${query}". Load more to keep searching.`
              : `Nothing matched "${query}".`
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filtered.map((entry) => (
            <PlaylistCardLazy
              key={entry.playlist.identifier}
              entry={entry}
              hideCreatorIfMatches={name}
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
