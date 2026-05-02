"use client";

import { useState } from "react";
import { Play, Check, AlertCircle } from "lucide-react";
import {
  parachordImportPlaylist,
  parachordPlayTrack,
  parachordQueueAdd,
  type ParachordTrack,
} from "@/lib/parachord";
import { cn } from "@/lib/utils";

const PARACHORD_HTTP = "http://127.0.0.1:8888/protocol";
const HTTP_TIMEOUT_MS = 1800;

async function fireHttp(protocolUrl: string, signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(
      `${PARACHORD_HTTP}?url=${encodeURIComponent(protocolUrl)}`,
      { signal },
    );
    return res.ok;
  } catch {
    return false;
  }
}

interface OpenInParachordButtonProps {
  tracks: ParachordTrack[];
  /** Used if Parachord's HTTP endpoint is unreachable. */
  fallback: { title: string; creator?: string };
  label?: string;
  className?: string;
}

type Status = "idle" | "busy" | "success" | "error";

/**
 * Single button that hands a tracklist (album, station, playlist) off to
 * Parachord. When Parachord is running and reachable on its local HTTP
 * endpoint, this clears the queue, plays track 1, and queues 2..N. When it
 * isn't, it falls back to a one-shot `parachord://import` URL so the OS
 * can wake Parachord and load the tracks as a playlist.
 */
export function OpenInParachordButton({
  tracks,
  fallback,
  label = "Open in Parachord",
  className,
}: OpenInParachordButtonProps) {
  const [status, setStatus] = useState<Status>("idle");

  async function handleClick() {
    if (tracks.length === 0) return;
    setStatus("busy");

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
    const firstOk = await fireHttp(
      parachordPlayTrack({
        artist: tracks[0].artist,
        title: tracks[0].title,
      }),
      ctrl.signal,
    );
    clearTimeout(timer);

    if (!firstOk) {
      // Parachord HTTP endpoint isn't reachable — fall back to a single
      // protocol URL that loads everything as a playlist via the OS.
      const importUrl = parachordImportPlaylist({
        title: fallback.title,
        creator: fallback.creator,
        tracks,
      });
      window.location.href = importUrl;
      setStatus("idle");
      return;
    }

    // Queue the rest in order. We don't bail on individual failures —
    // they're additive and best-effort.
    for (const track of tracks.slice(1)) {
      await fireHttp(parachordQueueAdd(track));
    }

    setStatus("success");
    setTimeout(() => setStatus("idle"), 2500);
  }

  const Icon =
    status === "success" ? Check : status === "error" ? AlertCircle : Play;
  const text =
    status === "busy"
      ? "Queueing…"
      : status === "success"
        ? `Queued ${tracks.length}`
        : status === "error"
          ? "Couldn't reach Parachord"
          : label;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={status === "busy"}
      className={cn(
        "bg-primary text-primary-foreground inline-flex h-7 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-50",
        className,
      )}
    >
      <Icon className={cn("size-3", status === "idle" && "fill-current")} />
      {text}
    </button>
  );
}
