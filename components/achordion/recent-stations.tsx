"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Globe, Tag, User, X } from "lucide-react";
import {
  clearRecentStations,
  loadRecentStations,
  recordRecentStation,
  removeRecentStation,
  type RecentStation,
} from "@/lib/recent-stations";
import { prettifyPrompt } from "@/lib/lb-radio-prompt";
import type { RadioMode } from "@/lib/radio-modes";
import { modeLabel } from "@/lib/radio-modes";

/** Best-effort classification of a prompt for the chip icon — same
 *  heuristic as the StationBuilder preset chips. */
type Kind = "artist" | "country" | "tag";
function kindOf(prompt: string): Kind {
  if (/\bartist:\(/i.test(prompt)) return "artist";
  if (/\bcountry:\(/i.test(prompt)) return "country";
  return "tag";
}

function Icon({ kind }: { kind: Kind }) {
  const Component = kind === "artist" ? User : kind === "country" ? Globe : Tag;
  return <Component className="text-muted-foreground/80 size-3 shrink-0" />;
}

/**
 * Silently records a station to localStorage on mount. Renders
 * nothing — placement is just for lifecycle. Mount this once per
 * successful station build (i.e. inside the StationResults success
 * branch, not in the error branch) so failed prompts don't pollute
 * the list.
 */
export function RecordRecentStation({
  prompt,
  mode,
}: {
  prompt: string;
  mode: RadioMode;
}) {
  useEffect(() => {
    recordRecentStation({ prompt, mode });
  }, [prompt, mode]);
  return null;
}

/**
 * Renders the user's recently-created stations as clickable chips,
 * each with a small X to remove that single entry. A "Clear all"
 * link wipes the list. Returns null until mount completes (avoids
 * an SSR/CSR mismatch — the list lives in localStorage which the
 * server can't see).
 */
export function RecentStationsRow() {
  const [stations, setStations] = useState<RecentStation[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setStations(loadRecentStations());
    setHydrated(true);
    // Listen for storage events so a remove/record in another tab
    // updates this list. Same-tab record() / remove() are reflected
    // by setStations directly below, so this only catches cross-tab.
    function onStorage(e: StorageEvent) {
      if (e.key === "achordion:recent-stations") {
        setStations(loadRecentStations());
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  if (!hydrated || stations.length === 0) return null;

  function handleRemove(s: RecentStation) {
    setStations(removeRecentStation(s.prompt, s.mode));
  }

  function handleClearAll() {
    setStations(clearRecentStations());
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-muted-foreground/80 text-xs tracking-wide uppercase">
          Recently created
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
        {stations.map((s) => {
          const params = new URLSearchParams({ prompt: s.prompt, mode: s.mode });
          const href = `/radio/builder?${params}#station-results`;
          return (
            <li
              key={`${s.prompt}::${s.mode}`}
              className="border-border/60 hover:border-foreground/40 hover:bg-muted/40 inline-flex items-center gap-1.5 rounded-full border pr-1 pl-3 py-1 text-xs transition-colors"
            >
              <Icon kind={kindOf(s.prompt)} />
              <Link
                href={href}
                className="text-foreground hover:underline"
                title={s.prompt}
              >
                {prettifyPrompt(s.prompt)}
              </Link>
              <span className="text-muted-foreground/70 hidden sm:inline">
                · {modeLabel(s.mode)}
              </span>
              {/* Inline X to remove this single entry. Sits inside the
                  chip pill so it's spatially associated with the chip
                  it deletes. */}
              <button
                type="button"
                onClick={() => handleRemove(s)}
                aria-label={`Remove ${prettifyPrompt(s.prompt)} from recent stations`}
                className="text-muted-foreground/70 hover:text-foreground hover:bg-muted ml-0.5 inline-flex size-5 items-center justify-center rounded-full transition-colors"
              >
                <X className="size-3" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
