"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Per-entity tag chips with upvote / downvote / withdraw + add new
 * tag affordances. Mirrors the LB tag pill UI (name + count + ▲ ▼).
 *
 * Used on artist / release-group / recording / release pages. The
 * tag list itself is server-rendered for SEO + first-paint; this
 * component re-renders on top of it once the user-vote state
 * resolves so the controls show the right active state.
 *
 * Auth flow:
 *   - Signed out → no controls, just the linked names. Click on a
 *     vote affordance prompts sign-in.
 *   - Signed in WITHOUT the `tag` MB OAuth scope → controls render,
 *     but vote click triggers a re-auth signIn() to widen scope.
 *   - Signed in WITH `tag` scope → vote calls go through.
 *
 * Re-auth is lazy on purpose: existing users stay signed in for
 * reads + reviews + everything else; only the first vote click
 * forces them to step through the OAuth bounce.
 */

export type TagEntity = "artist" | "release-group" | "recording" | "release";

interface TagInput {
  name: string;
  count: number;
}

interface TagChipsProps {
  entity: TagEntity;
  mbid: string;
  /** Tags from the MB read API (sorted by count desc upstream).
   *  Acts as the SEO-friendly initial render — we never throw it
   *  away, just augment with vote state on hydration. */
  initialTags: TagInput[];
  /** Hard cap on chips shown without a "see more" disclosure. */
  limit?: number;
}

interface VotesResponse {
  votes: Record<string, "upvote" | "downvote">;
}

const QUERY_KEY = (entity: string, mbid: string) =>
  ["mb-tag-votes", entity, mbid] as const;

export function TagChips({
  entity,
  mbid,
  initialTags,
  limit = 12,
}: TagChipsProps) {
  const { data: session, status: sessionStatus } = useSession();
  const queryClient = useQueryClient();

  // Fetch the viewer's vote state. Skip while session is loading or
  // when signed out — anonymous viewers see read-only chips.
  const votesQuery = useQuery<VotesResponse>({
    queryKey: QUERY_KEY(entity, mbid),
    queryFn: async () => {
      const r = await fetch(
        `/api/musicbrainz/${entity}/${encodeURIComponent(mbid)}/tags`,
        { credentials: "same-origin" },
      );
      if (!r.ok) throw new Error("fetch votes failed");
      return r.json();
    },
    enabled: sessionStatus === "authenticated",
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // Local optimistic-tag list. Lets a brand-new tag appear in the
  // chip row immediately on submit, before the server roundtrip
  // returns and we refetch the canonical MB list.
  const [pendingTags, setPendingTags] = useState<TagInput[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [reAuthInFlight, startReAuthTransition] = useTransition();

  const merged = mergeTags(initialTags, pendingTags);
  const visible = merged.slice(0, limit);

  const voteMutation = useMutation({
    mutationFn: async (vars: { tag: string; vote: TagVote }) => {
      const r = await fetch(
        `/api/musicbrainz/${entity}/${encodeURIComponent(mbid)}/tags`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(vars),
        },
      );
      if (r.status === 401) {
        const data = (await r.json().catch(() => ({}))) as {
          reason?: "unauthenticated" | "scope_required";
        };
        const reason = data.reason ?? "scope_required";
        const err = new Error("auth required");
        (err as Error & { reason?: string }).reason = reason;
        throw err;
      }
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `vote failed (${r.status})`);
      }
      return (await r.json()) as VotesResponse;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(QUERY_KEY(entity, mbid), data);
      // Wipe pending tags whose names match anything now in the
      // server's canonical vote map — it'll come back from MB on
      // the next entity-detail render. Until then keep the chip in
      // place via a synthetic count so the user sees their addition.
    },
    onError: (err) => {
      const reason = (err as Error & { reason?: string }).reason;
      if (reason === "unauthenticated") {
        startReAuthTransition(() => {
          void signIn("musicbrainz");
        });
      } else if (reason === "scope_required") {
        // Re-run the OAuth flow with the widened scope. Auth.js will
        // re-issue the JWT with the new scope on the round-trip.
        startReAuthTransition(() => {
          void signIn("musicbrainz");
        });
      }
    },
  });

  function handleVote(name: string, vote: TagVote) {
    if (sessionStatus !== "authenticated") {
      startReAuthTransition(() => {
        void signIn("musicbrainz");
      });
      return;
    }
    voteMutation.mutate({ tag: name, vote });
  }

  function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    const tag = draft.trim().toLowerCase();
    if (!tag) return;
    setPendingTags((prev) =>
      prev.some((t) => t.name === tag)
        ? prev
        : [...prev, { name: tag, count: 0 }],
    );
    setDraft("");
    setAddOpen(false);
    handleVote(tag, "upvote");
  }

  if (visible.length === 0 && sessionStatus !== "authenticated") {
    // Anonymous + empty → render nothing rather than a hollow row.
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visible.map((t) => {
        const userVote = votesQuery.data?.votes[t.name] ?? null;
        return (
          <TagChip
            key={t.name}
            tag={t}
            userVote={userVote}
            disabled={voteMutation.isPending || reAuthInFlight}
            onVote={(v) => handleVote(t.name, v)}
          />
        );
      })}
      {sessionStatus === "authenticated" && (
        addOpen ? (
          <form onSubmit={handleAddSubmit} className="flex items-center gap-1">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="new tag"
              maxLength={80}
              className="border-border/60 bg-background h-7 rounded-full border px-3 text-xs outline-none focus:ring-2 focus:ring-ring/30"
            />
            <button
              type="button"
              onClick={() => {
                setAddOpen(false);
                setDraft("");
              }}
              className="text-muted-foreground hover:text-foreground text-xs underline-offset-2"
            >
              cancel
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="border-border/60 hover:border-foreground/50 hover:bg-muted/30 inline-flex items-center gap-1 rounded-full border px-3 py-0.5 text-xs text-muted-foreground"
          >
            <Plus className="size-3" />
            tag
          </button>
        )
      )}
      {votesQuery.isLoading && sessionStatus === "authenticated" && (
        <Skeleton className="h-5 w-12 rounded-full" />
      )}
    </div>
  );
}

type TagVote = "upvote" | "downvote" | "withdraw";

function TagChip({
  tag,
  userVote,
  disabled,
  onVote,
}: {
  tag: TagInput;
  userVote: "upvote" | "downvote" | null;
  disabled: boolean;
  onVote: (vote: TagVote) => void;
}) {
  const upActive = userVote === "upvote";
  const downActive = userVote === "downvote";
  return (
    <span
      className={
        "border-border/60 bg-muted/40 inline-flex items-center gap-1 rounded-full border px-1 py-0.5 text-xs"
      }
    >
      <Link
        href={`/tag/${encodeURIComponent(tag.name)}`}
        className="text-foreground/90 hover:underline px-1.5"
      >
        {tag.name}
      </Link>
      {tag.count > 0 && (
        <span className="text-muted-foreground tabular-nums">{tag.count}</span>
      )}
      <button
        type="button"
        onClick={() => onVote(upActive ? "withdraw" : "upvote")}
        disabled={disabled}
        aria-label={upActive ? `Withdraw upvote on ${tag.name}` : `Upvote ${tag.name}`}
        className={
          (upActive
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-muted-foreground hover:text-foreground") +
          " inline-flex size-5 items-center justify-center rounded-full disabled:opacity-50"
        }
      >
        <ChevronUp className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onVote(downActive ? "withdraw" : "downvote")}
        disabled={disabled}
        aria-label={downActive ? `Withdraw downvote on ${tag.name}` : `Downvote ${tag.name}`}
        className={
          (downActive
            ? "text-rose-600 dark:text-rose-400"
            : "text-muted-foreground hover:text-foreground") +
          " inline-flex size-5 items-center justify-center rounded-full disabled:opacity-50"
        }
      >
        <ChevronDown className="size-3.5" />
      </button>
    </span>
  );
}

function mergeTags(initial: TagInput[], pending: TagInput[]): TagInput[] {
  const seen = new Set(initial.map((t) => t.name));
  return [...initial, ...pending.filter((t) => !seen.has(t.name))];
}
