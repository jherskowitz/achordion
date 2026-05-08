"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AtSign, Disc3, Music, User, X } from "lucide-react";
import {
  clearRecentSearches,
  loadRecentSearches,
  recentSearchHref,
  removeRecentSearch,
  type RecentSearch,
  type RecentSearchKind,
} from "@/lib/recent-searches";

function KindIcon({ kind }: { kind: RecentSearchKind }) {
  const Component =
    kind === "artist"
      ? User
      : kind === "album"
        ? Disc3
        : kind === "song"
          ? Music
          : AtSign;
  return <Component className="text-muted-foreground/80 size-3 shrink-0" />;
}

/**
 * Renders the user's recently-clicked search results as chips. Used
 * in the typeahead's empty-state — when the search box is empty,
 * the recent list takes the place of the would-be result panel.
 *
 * Returns null until mount completes and the list is non-empty
 * (avoids an SSR/CSR mismatch since localStorage isn't readable on
 * the server).
 */
export function RecentSearchesRow() {
  const [searches, setSearches] = useState<RecentSearch[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Initial hydrate from localStorage. Can't be a useState lazy
    // initializer because localStorage isn't available during SSR,
    // and a window-typeof guard there triggers a hydration mismatch.
    // Post-mount setState is the canonical "sync to external store"
    // pattern despite react-hooks/set-state-in-effect's warning.
    /* eslint-disable react-hooks/set-state-in-effect */
    setSearches(loadRecentSearches());
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    function onStorage(e: StorageEvent) {
      if (e.key === "achordion:recent-searches") {
        setSearches(loadRecentSearches());
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  if (!hydrated || searches.length === 0) return null;

  function handleRemove(s: RecentSearch) {
    setSearches(removeRecentSearch(s.kind, s.id));
  }

  function handleClearAll() {
    setSearches(clearRecentSearches());
  }

  return (
    <div className="mt-6">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-muted-foreground/80 text-xs tracking-wide uppercase">
          Recently clicked
        </p>
        <button
          type="button"
          onClick={handleClearAll}
          className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
        >
          Clear all
        </button>
      </div>
      <ul className="mt-2 flex flex-wrap gap-2">
        {searches.map((s) => (
          <li
            key={`${s.kind}::${s.id}`}
            className="border-border/60 hover:border-foreground/40 hover:bg-muted/40 inline-flex items-center gap-1.5 rounded-full border py-1 pr-1 pl-3 text-xs transition-colors"
          >
            <KindIcon kind={s.kind} />
            <Link
              href={recentSearchHref(s)}
              className="text-foreground hover:underline"
              title={s.sublabel ?? s.label}
            >
              {s.label}
            </Link>
            {s.sublabel && (
              <span className="text-muted-foreground/70 hidden truncate sm:inline">
                · {s.sublabel}
              </span>
            )}
            <button
              type="button"
              onClick={() => handleRemove(s)}
              aria-label={`Remove ${s.label} from recent searches`}
              className="text-muted-foreground/70 hover:text-foreground hover:bg-muted ml-0.5 inline-flex size-5 items-center justify-center rounded-full transition-colors"
            >
              <X className="size-3" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
