"use client";

import type { RadioMode } from "@/lib/radio-modes";

/**
 * Recently-created radio stations, stored in browser localStorage so
 * the user's history follows them across sessions on the same device
 * without any Achordion-side state. The list auto-grows when a new
 * station builds successfully and the user can clear individual
 * entries or wipe the whole list.
 *
 * Same-device only by design — matches Achordion's stateless
 * posture. If a future need to sync across devices comes up, this
 * is the layer to swap for a server-side store keyed by MB user id.
 */

const STORAGE_KEY = "achordion:recent-stations";
const MAX_ENTRIES = 12;

export interface RecentStation {
  prompt: string;
  mode: RadioMode;
  /** Unix milliseconds when the station was first built. */
  createdAt: number;
}

function isStation(value: unknown): value is RecentStation {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as RecentStation).prompt === "string" &&
    typeof (value as RecentStation).mode === "string" &&
    typeof (value as RecentStation).createdAt === "number"
  );
}

/** Read the saved list. Safe to call from anywhere — returns [] when
 *  localStorage isn't available (SSR, disabled storage, parse errors). */
export function loadRecentStations(): RecentStation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStation);
  } catch {
    return [];
  }
}

function persist(list: RecentStation[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Quota or disabled storage — silently fail; the in-memory state
    // in the calling component still updates so the UI feels right.
  }
}

/**
 * Add (or move-to-front, if it exists) a station to the recent list.
 * De-dupe key is `prompt + mode` — the same prompt at a different
 * mode is a different station. Returns the new list.
 */
export function recordRecentStation(
  station: Omit<RecentStation, "createdAt">,
): RecentStation[] {
  const existing = loadRecentStations();
  const id = `${station.prompt}::${station.mode}`;
  const filtered = existing.filter(
    (s) => `${s.prompt}::${s.mode}` !== id,
  );
  const next: RecentStation[] = [
    { ...station, createdAt: Date.now() },
    ...filtered,
  ].slice(0, MAX_ENTRIES);
  persist(next);
  return next;
}

/** Remove a single station by `prompt + mode`. Returns the new list. */
export function removeRecentStation(
  prompt: string,
  mode: RadioMode,
): RecentStation[] {
  const id = `${prompt}::${mode}`;
  const next = loadRecentStations().filter(
    (s) => `${s.prompt}::${s.mode}` !== id,
  );
  persist(next);
  return next;
}

/** Wipe the whole recent list. Returns the new (empty) list. */
export function clearRecentStations(): RecentStation[] {
  persist([]);
  return [];
}
