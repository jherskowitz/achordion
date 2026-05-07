"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
  const [needsReAuth, setNeedsReAuth] = useState(false);

  const triggerReAuth = async () => {
    setNeedsReAuth(true);
    const callbackUrl =
      typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : "/";
    // Two-step re-auth: sign out THEN sign in. With Auth.js v5 +
    // an active session, calling signIn() alone doesn't always
    // re-run the OAuth handshake — it can return the existing
    // session token unchanged, so the JWT never picks up the new
    // `mbAccessToken` / `mbScope` fields and tag voting keeps
    // 401-ing in a loop. Clearing the session first guarantees a
    // fresh OAuth round-trip with the widened scope, after which
    // the JWT callback fires with `account` populated and we
    // capture the access token.
    await signOut({ redirect: false });
    void signIn("musicbrainz", { callbackUrl });
  };

  const merged = mergeTags(initialTags, pendingTags);
  const visible = merged.slice(0, limit);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
    // Optimistic update: flip the chip's vote state immediately on
    // click, BEFORE the server roundtrip + MB read-back. MB's tag
    // index lags vote writes by a minute or two — without the
    // optimistic update the chip sits inert post-click and the user
    // can't tell anything happened.
    onMutate: async ({ tag, vote }) => {
      setErrorMsg(null);
      await queryClient.cancelQueries({ queryKey: QUERY_KEY(entity, mbid) });
      const previous = queryClient.getQueryData<VotesResponse>(
        QUERY_KEY(entity, mbid),
      );
      const next: VotesResponse = {
        votes: { ...(previous?.votes ?? {}) },
      };
      if (vote === "withdraw") delete next.votes[tag];
      else next.votes[tag] = vote;
      queryClient.setQueryData(QUERY_KEY(entity, mbid), next);
      return { previous };
    },
    onSuccess: (data) => {
      // MB sometimes returns the post-vote state with the new entry;
      // sometimes it lags and returns the pre-vote state. Merge: keep
      // anything the optimistic update set, override with anything the
      // server explicitly reports. That way the chip stays green even
      // if MB's read hasn't caught up yet.
      const optimistic = queryClient.getQueryData<VotesResponse>(
        QUERY_KEY(entity, mbid),
      );
      const merged: VotesResponse = {
        votes: { ...(optimistic?.votes ?? {}), ...data.votes },
      };
      queryClient.setQueryData(QUERY_KEY(entity, mbid), merged);
    },
    onError: (err, _vars, context) => {
      // Roll back the optimistic flip on any non-auth failure so the
      // chip doesn't lie about state.
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEY(entity, mbid), context.previous);
      }
      const reason = (err as Error & { reason?: string }).reason;
      if (reason === "unauthenticated" || reason === "scope_required") {
        void triggerReAuth();
      } else {
        setErrorMsg(
          err instanceof Error ? err.message : "Couldn't submit vote",
        );
      }
    },
  });

  function handleVote(name: string, vote: TagVote) {
    if (sessionStatus !== "authenticated") {
      void triggerReAuth();
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
        // Bump the displayed count by the user's own vote so the
        // number changes the moment they click. MB's read API will
        // catch up to the new tally on the next page render —
        // until then the local delta keeps the UI honest about
        // what the user just did.
        const displayCount = t.count + voteDelta(userVote);
        return (
          <TagChip
            key={t.name}
            tag={t}
            displayCount={displayCount}
            userVote={userVote}
            disabled={voteMutation.isPending}
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
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                aria-label="Add a tag"
                className="border-border/60 hover:border-foreground/50 hover:bg-muted/30 inline-flex items-center gap-1 rounded-full border px-3 py-0.5 text-xs text-muted-foreground"
              >
                <Plus className="size-3" />
                tag
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-[16rem] text-center text-xs">
              Add a community-driven tag — counts roll up across
              MusicBrainz and help define radio stations.
            </TooltipContent>
          </Tooltip>
        )
      )}
      {votesQuery.isLoading && sessionStatus === "authenticated" && (
        <Skeleton className="h-5 w-12 rounded-full" />
      )}
      {needsReAuth && (
        // Visible re-auth affordance. The first vote click already
        // triggered a `signIn()` that should have redirected; this
        // button is a fallback in case the auto-redirect was blocked
        // (popup blockers, transition batching, etc.). Clicking it
        // hits the same flow.
        <button
          type="button"
          onClick={() => void triggerReAuth()}
          className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 ml-1 inline-flex items-center rounded-full border px-3 py-0.5 text-xs hover:bg-amber-500/20"
        >
          Re-sign in to vote
        </button>
      )}
      {errorMsg && !needsReAuth && (
        <span
          role="status"
          aria-live="polite"
          className="text-amber-600 dark:text-amber-400 ml-1 inline-flex items-center text-xs"
        >
          {errorMsg}
        </span>
      )}
    </div>
  );
}

type TagVote = "upvote" | "downvote" | "withdraw";

/**
 * Map a user's current vote to a count delta vs the server-rendered
 * tally. The server count we receive doesn't include this viewer's
 * vote (it's the public tally), so we add or subtract one to match
 * what MB's server sees post-vote.
 */
function voteDelta(userVote: "upvote" | "downvote" | null): number {
  if (userVote === "upvote") return 1;
  if (userVote === "downvote") return -1;
  return 0;
}

function TagChip({
  tag,
  displayCount,
  userVote,
  disabled,
  onVote,
}: {
  tag: TagInput;
  displayCount: number;
  userVote: "upvote" | "downvote" | null;
  disabled: boolean;
  onVote: (vote: TagVote) => void;
}) {
  const upActive = userVote === "upvote";
  const downActive = userVote === "downvote";
  // Two-zone pill: left half is always a link to the tag page; right
  // half (vote controls) hides by default and reveals on hover so
  // visitors who don't vote get a clean chip row. Active votes
  // (`upActive` / `downActive`) keep the right half visible always —
  // a green/red caret would otherwise vanish into a generic chip and
  // the user would lose track of how they voted.
  //
  // Touch devices have no hover, so `pointer-coarse:inline-flex`
  // forces the controls visible on phones / tablets rather than
  // hiding behind an inaccessible hover gesture.
  const voteVisible = upActive || downActive;
  return (
    <span className="group border-border/60 bg-muted/40 inline-flex items-stretch overflow-hidden rounded-full border text-xs">
      <Link
        href={`/tag/${encodeURIComponent(tag.name)}`}
        className="text-foreground/90 hover:bg-muted hover:text-foreground inline-flex items-center px-2.5 py-0.5 transition-colors"
      >
        {tag.name}
      </Link>
      {/*
       * Voting half: max-width + opacity transition for a smooth
       * slide-out reveal on hover. We can't transition `display`
       * (hidden ↔ inline-flex), so the half is always inline-flex
       * but collapsed to zero width with hidden overflow when not
       * active. Touch devices keep it open via `pointer-coarse:`.
       *
       * Divider matches the same fade so it doesn't appear as a
       * standalone hairline before the controls slide in.
       */}
      <span
        aria-hidden="true"
        className={
          "border-border/60 self-stretch border-l opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100 pointer-coarse:opacity-100" +
          (voteVisible ? " opacity-100" : "")
        }
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={
              "inline-flex max-w-0 items-center gap-1 overflow-hidden whitespace-nowrap py-0.5 opacity-0 transition-[max-width,opacity,padding] duration-200 ease-out group-hover:max-w-[10rem] group-hover:px-1.5 group-hover:opacity-100 hover:bg-muted pointer-coarse:max-w-[10rem] pointer-coarse:px-1.5 pointer-coarse:opacity-100" +
              (voteVisible
                ? " max-w-[10rem] px-1.5 opacity-100"
                : "")
            }
          >
            <button
              type="button"
              onClick={() => onVote(upActive ? "withdraw" : "upvote")}
              disabled={disabled}
              aria-label={upActive ? `Withdraw upvote on ${tag.name}` : `Upvote ${tag.name}`}
              className={
                (upActive
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-muted-foreground hover:text-foreground") +
                " inline-flex size-4 items-center justify-center rounded-full disabled:opacity-50"
              }
            >
              <ChevronUp className="size-3.5" />
            </button>
            {displayCount > 0 && (
              <span className="text-muted-foreground tabular-nums">
                {displayCount}
              </span>
            )}
            <button
              type="button"
              onClick={() => onVote(downActive ? "withdraw" : "downvote")}
              disabled={disabled}
              aria-label={downActive ? `Withdraw downvote on ${tag.name}` : `Downvote ${tag.name}`}
              className={
                (downActive
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-muted-foreground hover:text-foreground") +
                " inline-flex size-4 items-center justify-center rounded-full disabled:opacity-50"
              }
            >
              <ChevronDown className="size-3.5" />
            </button>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-[16rem] text-center text-xs">
          Tags are community-driven. Vote up if it fits, down if it
          doesn&apos;t — counts roll up across MusicBrainz and help
          define radio stations.
        </TooltipContent>
      </Tooltip>
    </span>
  );
}

function mergeTags(initial: TagInput[], pending: TagInput[]): TagInput[] {
  const seen = new Set(initial.map((t) => t.name));
  return [...initial, ...pending.filter((t) => !seen.has(t.name))];
}
