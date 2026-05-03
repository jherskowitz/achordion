"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { CoverArt } from "./cover-art";
import { LazyArtistAvatar } from "./lazy-artist-avatar";
import { UserAvatar } from "./user-avatar";
import { caaReleaseGroupUrl } from "@/lib/clients/coverart";
import { artistHref } from "@/lib/entity-links";

/**
 * Client-side type-ahead search.
 *
 * Architecture:
 *   - One <input>; results stream in from `/api/search` 250ms after
 *     the user stops typing.
 *   - Each keystroke that lands a new debounced value cancels the
 *     previous fetch via AbortController so stale responses can't
 *     overwrite fresher ones.
 *   - URL syncs to `?q=...` on debounce so the page is shareable
 *     without polluting back-history (we use router.replace, not
 *     push).
 *   - Power filters parsed server-side: `artist:`, `album:`,
 *     `song:` / `track:` / `recording:`, `user:`. Single leading
 *     prefix per query.
 */

interface CreditPart {
  name: string;
  mbid: string | null;
  join: string;
}
interface ArtistRow {
  id: string;
  name: string;
  disambiguation: string | null;
  type: string | null;
  country: string | null;
}
interface AlbumRow {
  id: string;
  title: string;
  artists: CreditPart[];
  type: string | null;
  year: string | null;
}
interface SongRow {
  id: string;
  title: string;
  artists: CreditPart[];
  length: number | null;
  caaReleaseMbid: string | null;
  caaId: number | string | null;
  releaseGroupMbid: string | null;
}
interface UserRow {
  name: string;
}
interface SearchResults {
  artists: ArtistRow[];
  albums: AlbumRow[];
  songs: SongRow[];
  users: UserRow[];
}

const EMPTY: SearchResults = { artists: [], albums: [], songs: [], users: [] };

function useDebounced<T>(value: T, delay = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export function SearchTypeahead({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const debouncedQ = useDebounced(q, 250);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Trigger fetch + URL sync on each debounced query commit.
  useEffect(() => {
    abortRef.current?.abort();
    if (!debouncedQ.trim()) {
      setResults(null);
      setLoading(false);
      // Clear ?q= when the box is emptied.
      router.replace("/search", { scroll: false });
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(debouncedQ)}`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: SearchResults | null) => {
        if (!controller.signal.aborted) setResults(data ?? EMPTY);
      })
      .catch((err: Error) => {
        if (err.name !== "AbortError") setResults(EMPTY);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    // Keep the URL shareable; replace (not push) so typing doesn't
    // spam history entries.
    router.replace(`/search?q=${encodeURIComponent(debouncedQ)}`, {
      scroll: false,
    });
  }, [debouncedQ, router]);

  const hasAny =
    results !== null &&
    (results.artists.length +
      results.albums.length +
      results.songs.length +
      results.users.length >
      0);

  return (
    <div>
      <div className="relative mb-10 flex max-w-xl items-center">
        <Search className="text-muted-foreground/70 absolute left-3 size-4" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search artists, albums, songs, users…"
          aria-label="Search"
          autoFocus
          className="border-border/60 bg-background placeholder:text-muted-foreground/70 focus:ring-ring/30 h-10 w-full rounded-lg border px-3 pl-9 text-sm outline-none focus:ring-2"
        />
        {loading && (
          <Loader2
            className="text-muted-foreground/70 absolute right-3 size-4 animate-spin"
            aria-label="Searching"
          />
        )}
      </div>

      {/* Power-filter hint, shown only when the box is empty. */}
      {!q.trim() && (
        <p className="text-muted-foreground/80 text-xs">
          Tip: prefix with <code>artist:</code>, <code>album:</code>,{" "}
          <code>song:</code>, or <code>user:</code> to limit the search to
          one kind. (e.g. <code>artist:hozier</code>.)
        </p>
      )}

      {q.trim() && results === null && !loading && null}

      {results !== null && !hasAny && !loading && (
        <p className="text-muted-foreground text-sm">
          Nothing matched <span className="text-foreground">{q}</span>.
        </p>
      )}

      {results !== null && hasAny && (
        <div className="space-y-10">
          {results.artists.length > 0 && (
            <ResultSection title="Artists">
              <ul className="space-y-1">
                {results.artists.map((a) => (
                  <ArtistRow key={a.id} row={a} />
                ))}
              </ul>
            </ResultSection>
          )}
          {results.albums.length > 0 && (
            <ResultSection title="Albums">
              <ul className="space-y-2">
                {results.albums.map((rg) => (
                  <AlbumRowComponent key={rg.id} row={rg} />
                ))}
              </ul>
            </ResultSection>
          )}
          {results.songs.length > 0 && (
            <ResultSection title="Songs">
              <ul className="space-y-1">
                {results.songs.map((s) => (
                  <SongRowComponent key={s.id} row={s} />
                ))}
              </ul>
            </ResultSection>
          )}
          {results.users.length > 0 && (
            <ResultSection title="Users">
              <ul className="space-y-1">
                {results.users.map((u) => (
                  <UserRowComponent key={u.name} row={u} />
                ))}
              </ul>
            </ResultSection>
          )}
        </div>
      )}
    </div>
  );
}

function ResultSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 text-xs tracking-wide uppercase text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

// ── Row components ──────────────────────────────────────────────────

/**
 * Lazy artist avatar: paints DiceBear immediately so the row never
 * blocks on Wikidata, then asynchronously fetches the real image and
 * swaps it in if one exists. Uses the Avatar primitive's natural
 * fallback ladder — AvatarImage paints when its src loads, otherwise
 * the AvatarFallback letter shows through, with the DiceBear SVG as
 * the always-present-but-low-priority placeholder behind both.
 */
function ArtistRow({ row }: { row: ArtistRow }) {
  return (
    <li>
      <Link
        href={`/artist/${row.id}`}
        className="hover:bg-muted/50 flex items-center gap-3 rounded-md p-2"
      >
        <LazyArtistAvatar mbid={row.id} name={row.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{row.name}</p>
          {row.disambiguation && (
            <p className="text-muted-foreground truncate text-xs">
              {row.disambiguation}
            </p>
          )}
          {(row.type || row.country) && (
            <p className="text-muted-foreground/70 truncate text-xs">
              {[row.type, row.country].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      </Link>
    </li>
  );
}

/**
 * Render an MB artist-credit as an inline sequence of separate links
 * with the original join phrases preserved between them. Local copy
 * because <ArtistCreditLinks> in /components/achordion/artist-credit-
 * links.tsx accepts a different shape (formatArtistCredit's `parts`);
 * here we already have the structured credit from the API.
 */
function CreditLinks({ parts }: { parts: CreditPart[] }) {
  if (parts.length === 0) return null;
  return (
    <>
      {parts.map((p, i) => (
        <span key={`${p.mbid ?? p.name}-${i}`}>
          <Link
            href={artistHref({ mbid: p.mbid, name: p.name })}
            className="hover:text-foreground hover:underline"
          >
            {p.name}
          </Link>
          {p.join}
        </span>
      ))}
    </>
  );
}

/**
 * Build the highest-fidelity cover-art URL we have for a song. The
 * recording → release → CAA chain prefers the specific release's
 * caa_release_mbid + caa_id when available (exact edition match);
 * falls back to caaReleaseGroupUrl when only the rg MBID is known.
 * Returns null if neither — the placeholder tile renders instead.
 */
function songCoverUrl(row: SongRow): string | null {
  if (row.caaReleaseMbid && row.caaId) {
    return `https://archive.org/download/mbid-${row.caaReleaseMbid}/mbid-${row.caaReleaseMbid}-${row.caaId}_thumb250.jpg`;
  }
  if (row.releaseGroupMbid) {
    return caaReleaseGroupUrl(row.releaseGroupMbid, 250);
  }
  return null;
}

/**
 * Album / song rows share the artist row's flex shape: cover on the
 * left, stacked text block on the right. Cover + title link to the
 * entity; the artist credit row sits as a sibling so each contributor
 * links separately without nesting anchors.
 */
function AlbumRowComponent({ row }: { row: AlbumRow }) {
  return (
    <li>
      <div className="hover:bg-muted/50 flex items-center gap-3 rounded-md p-2">
        <Link
          href={`/release-group/${row.id}`}
          className="shrink-0"
          aria-label={row.title}
        >
          <CoverArt
            src={caaReleaseGroupUrl(row.id, 250)}
            alt={row.title}
            size={40}
          />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            <Link
              href={`/release-group/${row.id}`}
              className="hover:underline"
            >
              {row.title}
            </Link>
          </p>
          <p className="text-muted-foreground truncate text-xs">
            <CreditLinks parts={row.artists} />
          </p>
          {(row.type || row.year) && (
            <p className="text-muted-foreground/70 truncate text-xs">
              {[row.type, row.year].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

function SongRowComponent({ row }: { row: SongRow }) {
  return (
    <li>
      <div className="hover:bg-muted/50 flex items-center gap-3 rounded-md p-2">
        <Link
          href={`/recording/${row.id}`}
          className="shrink-0"
          aria-label={row.title}
        >
          {/* CoverArt swaps to a Disc3 placeholder when the CAA URL
              404s — and a lot of recordings will, since LB's metadata
              lookup gives us a release identifier even for releases
              without cover art on file. Same component the album row
              uses, so song / album fallbacks look identical. */}
          <CoverArt src={songCoverUrl(row)} alt={row.title} size={40} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            <Link
              href={`/recording/${row.id}`}
              className="hover:underline"
            >
              {row.title}
            </Link>
          </p>
          <p className="text-muted-foreground truncate text-xs">
            <CreditLinks parts={row.artists} />
          </p>
        </div>
      </div>
    </li>
  );
}

function UserRowComponent({ row }: { row: UserRow }) {
  return (
    <li className="hover:bg-muted/50 rounded-md px-2 py-2">
      <Link
        href={`/user/${encodeURIComponent(row.name)}`}
        className="flex items-center gap-3 text-sm"
      >
        <UserAvatar
          username={row.name}
          className="size-8"
          fallbackClassName="text-xs"
        />
        {row.name}
      </Link>
    </li>
  );
}
