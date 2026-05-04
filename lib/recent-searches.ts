"use client";

/**
 * Recently-clicked search results, stored in browser localStorage.
 * Each entry represents an entity (artist / album / song / user) the
 * user actually navigated to from a typeahead search result — not
 * every typed query. Cap at 12 with move-to-front on duplicates.
 *
 * Same posture as `recent-stations.ts` — same-device only, no
 * Achordion-side state, mirrors the brand promise on /about.
 */

const STORAGE_KEY = "achordion:recent-searches";
const MAX_ENTRIES = 12;

export type RecentSearchKind = "artist" | "album" | "song" | "user";

export interface RecentSearch {
  kind: RecentSearchKind;
  /** MB MBID for music entities, ListenBrainz username for users. */
  id: string;
  /** Primary display label (artist name, album / song title, username). */
  label: string;
  /** Secondary display — artist credit on albums/songs. Optional. */
  sublabel?: string;
  /** Unix milliseconds of the most recent click. */
  clickedAt: number;
}

function isSearch(value: unknown): value is RecentSearch {
  if (typeof value !== "object" || value === null) return false;
  const v = value as RecentSearch;
  return (
    typeof v.kind === "string" &&
    ["artist", "album", "song", "user"].includes(v.kind) &&
    typeof v.id === "string" &&
    typeof v.label === "string" &&
    typeof v.clickedAt === "number"
  );
}

export function loadRecentSearches(): RecentSearch[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSearch);
  } catch {
    return [];
  }
}

function persist(list: RecentSearch[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Quota / disabled storage — silent.
  }
}

/**
 * Record a click on a search result. Move-to-front if `kind+id` is
 * already present so duplicates don't accumulate; updates the
 * `label` / `sublabel` from the latest click in case display data
 * has changed (e.g. an artist renamed).
 */
export function recordRecentSearch(
  search: Omit<RecentSearch, "clickedAt">,
): RecentSearch[] {
  const existing = loadRecentSearches();
  const id = `${search.kind}::${search.id}`;
  const filtered = existing.filter(
    (s) => `${s.kind}::${s.id}` !== id,
  );
  const next: RecentSearch[] = [
    { ...search, clickedAt: Date.now() },
    ...filtered,
  ].slice(0, MAX_ENTRIES);
  persist(next);
  return next;
}

export function removeRecentSearch(
  kind: RecentSearchKind,
  id: string,
): RecentSearch[] {
  const key = `${kind}::${id}`;
  const next = loadRecentSearches().filter(
    (s) => `${s.kind}::${s.id}` !== key,
  );
  persist(next);
  return next;
}

export function clearRecentSearches(): RecentSearch[] {
  persist([]);
  return [];
}

/** Build the destination URL for a recent search entry. */
export function recentSearchHref(s: RecentSearch): string {
  switch (s.kind) {
    case "artist":
      return `/artist/${s.id}`;
    case "album":
      return `/release-group/${s.id}`;
    case "song":
      return `/recording/${s.id}`;
    case "user":
      return `/user/${encodeURIComponent(s.id)}`;
  }
}
