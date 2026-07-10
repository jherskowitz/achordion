"use client";

import { useState, useTransition } from "react";
import { Check, AlertCircle } from "lucide-react";
import {
  revalidateMbEntity,
  revalidatePlaylist,
  revalidateCriticalDarlings,
} from "../actions";

const ENTITIES = [
  "recording",
  "release-group",
  "artist",
  "release",
  "playlist",
] as const;

export function CacheBustForm() {
  const [entity, setEntity] =
    useState<(typeof ENTITIES)[number]>("recording");
  const [mbid, setMbid] = useState("");
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "ok"; entity: string; mbid: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const [cdPending, startCdTransition] = useTransition();
  const [cdStatus, setCdStatus] = useState<
    { kind: "idle" } | { kind: "ok" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  function onBustCriticalDarlings() {
    setCdStatus({ kind: "idle" });
    startCdTransition(async () => {
      try {
        await revalidateCriticalDarlings();
        setCdStatus({ kind: "ok" });
      } catch (err) {
        setCdStatus({
          kind: "error",
          message: err instanceof Error ? err.message : "Unknown error.",
        });
      }
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = mbid.trim();
    if (!trimmed) return;
    setStatus({ kind: "idle" });
    startTransition(async () => {
      try {
        if (entity === "playlist") {
          await revalidatePlaylist({ mbid: trimmed });
        } else {
          await revalidateMbEntity({ entity, mbid: trimmed });
        }
        setStatus({ kind: "ok", entity, mbid: trimmed });
      } catch (err) {
        setStatus({
          kind: "error",
          message: err instanceof Error ? err.message : "Unknown error.",
        });
      }
    });
  }

  return (
    <div className="space-y-6">
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block">
        <span className="text-muted-foreground mb-1 block text-xs">
          Entity
        </span>
        <select
          value={entity}
          onChange={(e) =>
            setEntity(e.target.value as (typeof ENTITIES)[number])
          }
          className="border-border/60 bg-background block h-9 rounded-md border px-2 text-sm"
        >
          {ENTITIES.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-muted-foreground mb-1 block text-xs">
          {entity === "playlist" ? "Playlist ID" : "MBID"}
        </span>
        <input
          type="text"
          value={mbid}
          onChange={(e) => setMbid(e.target.value)}
          spellCheck={false}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          className="border-border/60 bg-background block h-9 w-full max-w-md rounded-md border px-2 font-mono text-sm"
        />
        {entity === "playlist" && (
          <span className="text-muted-foreground/70 mt-1 block text-[11px]">
            The UUID from a /playlist/&lt;id&gt; URL — ListenBrainz
            generates these, MusicBrainz proper doesn&apos;t have
            playlists as an entity.
          </span>
        )}
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !mbid.trim()}
          className="bg-primary text-primary-foreground inline-flex h-8 items-center rounded-md px-3 text-xs font-medium hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Busting…" : "Bust cache"}
        </button>
        {status.kind === "ok" && (
          <span className="text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1 text-xs">
            <Check className="size-3" />
            Busted {status.entity} {status.mbid}
          </span>
        )}
        {status.kind === "error" && (
          <span className="text-destructive inline-flex items-center gap-1 text-xs">
            <AlertCircle className="size-3" />
            {status.message}
          </span>
        )}
      </div>
    </form>

      <div className="border-border/60 space-y-2 border-t pt-4">
        <div>
          <p className="text-sm font-medium">Critical Darlings</p>
          <p className="text-muted-foreground/70 text-[11px]">
            No id — busts the whole surface (page + feed). Use after a
            manual Upstash store edit (a <code>DEL</code> or hand-fixed
            entry), which doesn&apos;t trigger the ingest route&apos;s
            revalidation on its own.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBustCriticalDarlings}
            disabled={cdPending}
            className="bg-primary text-primary-foreground inline-flex h-8 items-center rounded-md px-3 text-xs font-medium hover:opacity-90 disabled:opacity-50"
          >
            {cdPending ? "Busting…" : "Bust Critical Darlings cache"}
          </button>
          {cdStatus.kind === "ok" && (
            <span className="text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1 text-xs">
              <Check className="size-3" />
              Busted critical-darlings
            </span>
          )}
          {cdStatus.kind === "error" && (
            <span className="text-destructive inline-flex items-center gap-1 text-xs">
              <AlertCircle className="size-3" />
              {cdStatus.message}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
