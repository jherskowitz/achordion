"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { editPlaylistAction } from "@/app/(app)/playlist/[mbid]/actions";
import { cn } from "@/lib/utils";

/**
 * Edit Playlist modal — owner-only affordance that mirrors LB's own
 * playlist-edit dialog. Lets the user change title, description,
 * visibility, and collaborator list in a single round-trip.
 *
 * Uses the Base UI `Dialog` primitive (same engine as our Sheet) but
 * centered rather than slide-in, since the form is short and the
 * page-level layout doesn't have room to surrender for a side panel.
 *
 * Collaborators are managed locally as a chip list. Adds on Enter or
 * the explicit "+" — the field accepts ListenBrainz usernames; we
 * don't validate them client-side because LB will reject unknowns
 * server-side, and a typo'd username is the kind of mistake that
 * reads better as a save-time error than a yellow "no such user"
 * inline.
 */
export function PlaylistEditDialog({
  mbid,
  owner,
  initial,
  open,
  onOpenChange,
}: {
  mbid: string;
  /** Playlist creator — excluded from collaborator suggestions since
   *  LB doesn't allow self-collab. */
  owner: string | null;
  initial: {
    title: string;
    annotation: string;
    isPublic: boolean;
    collaborators: string[];
  };
  /** Controlled open state — caller (e.g. PlaylistOwnerToolsMenu)
   *  decides when to open from a menu item or other affordance. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const setOpen = onOpenChange;
  const [title, setTitle] = useState(initial.title);
  const [annotation, setAnnotation] = useState(initial.annotation);
  const [isPublic, setIsPublic] = useState(initial.isPublic);
  const [collaborators, setCollaborators] = useState<string[]>(
    initial.collaborators,
  );
  const [collabDraft, setCollabDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Typeahead state for collaborator search.
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced search against `/api/search?q=user:<draft>`. Aborts the
  // in-flight request on every new keystroke so stale responses can't
  // overwrite fresher ones, same pattern as the global search bar.
  useEffect(() => {
    if (!open) return;
    const q = collabDraft.trim();
    if (q.length < 2) {
      // Clear stale suggestions when query falls below threshold —
      // an external (typing) input drives this state reset.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSuggestions([]);
      return;
    }
    const handle = setTimeout(() => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      fetch(`/api/search?q=${encodeURIComponent(`user:${q}`)}`, {
        signal: ac.signal,
      })
        .then((r) => (r.ok ? r.json() : { users: [] }))
        .then((data: { users?: { name: string }[] }) => {
          const taken = new Set(
            collaborators.map((c) => c.toLowerCase()),
          );
          if (owner) taken.add(owner.toLowerCase());
          const filtered = (data.users ?? [])
            .map((u) => u.name)
            .filter((n) => !taken.has(n.toLowerCase()))
            .slice(0, 6);
          setSuggestions(filtered);
          setActiveIdx(filtered.length > 0 ? 0 : -1);
        })
        .catch(() => {
          // Abort or network error — fall through to empty suggestions.
        });
    }, 200);
    return () => clearTimeout(handle);
  }, [collabDraft, collaborators, owner, open]);

  // Re-seed local state when the modal opens, so reopening after a
  // server-side change (or cancel-then-reopen) reflects the latest
  // values rather than a stale draft. Prop-driven state reset — the
  // textbook valid case for setState-in-effect that the lint rule
  // still flags.
  useEffect(() => {
    if (open) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setTitle(initial.title);
      setAnnotation(initial.annotation);
      setIsPublic(initial.isPublic);
      setCollaborators(initial.collaborators);
      setCollabDraft("");
      setError(null);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [open, initial]);

  function addCollaborator(name?: string) {
    const trimmed = (name ?? collabDraft).trim();
    if (!trimmed) return;
    if (collaborators.some((c) => c.toLowerCase() === trimmed.toLowerCase()))
      return;
    setCollaborators([...collaborators, trimmed]);
    setCollabDraft("");
    setSuggestions([]);
    setActiveIdx(-1);
  }

  function onCollabKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      // Prefer the highlighted suggestion; fall back to raw input so
      // power users can type a known username and hit Enter without
      // waiting for the dropdown.
      if (showSuggestions && activeIdx >= 0 && suggestions[activeIdx]) {
        addCollaborator(suggestions[activeIdx]);
      } else {
        addCollaborator();
      }
    } else if (e.key === "ArrowDown" && suggestions.length > 0) {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp" && suggestions.length > 0) {
      e.preventDefault();
      setActiveIdx(
        (i) => (i - 1 + suggestions.length) % suggestions.length,
      );
    } else if (e.key === "Escape" && showSuggestions) {
      e.preventDefault();
      setShowSuggestions(false);
    } else if (
      e.key === "Backspace" &&
      collabDraft.length === 0 &&
      collaborators.length > 0
    ) {
      // Backspace on empty draft pops the last chip — same idiom as
      // most chip inputs (Gmail, Slack, etc.).
      setCollaborators(collaborators.slice(0, -1));
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await editPlaylistAction(mbid, {
        title,
        annotation,
        isPublic,
        collaborators,
      });
      if (!result.ok) {
        setError(result.reason);
        return;
      }
      setOpen(false);
      // Refresh the server-rendered page so the new title /
      // description / visibility paint without a full reload.
      router.refresh();
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs" />
        <Dialog.Popup className="bg-popover text-popover-foreground border-border/60 fixed top-1/2 left-1/2 z-50 w-[min(95vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border shadow-xl transition duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0">
          <div className="border-border/60 flex items-center justify-between border-b px-5 py-3">
            <Dialog.Title className="text-base font-medium">
              Edit playlist
            </Dialog.Title>
            <Dialog.Close
              render={
                <Button variant="ghost" size="icon-sm" />
              }
            >
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </Dialog.Close>
          </div>
          <form onSubmit={onSubmit} className="space-y-4 px-5 py-4">
            <Field label="Name" htmlFor="pl-title">
              <input
                id="pl-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="border-border/60 focus-visible:ring-foreground/30 w-full rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
              />
            </Field>

            <Field label="Description" htmlFor="pl-annotation">
              <textarea
                id="pl-annotation"
                value={annotation}
                onChange={(e) => setAnnotation(e.target.value)}
                rows={3}
                placeholder="What's this playlist about?"
                className="border-border/60 placeholder:text-muted-foreground/50 focus-visible:ring-foreground/30 w-full resize-y rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
              />
            </Field>

            <label className="flex items-center gap-2 text-sm select-none">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="accent-foreground size-4 cursor-pointer"
              />
              Make playlist public
            </label>

            <Field label="Collaborators" htmlFor="pl-collab">
              <div className="relative">
                <div className="border-border/60 focus-within:ring-foreground/30 flex flex-wrap items-center gap-1.5 rounded-md border bg-transparent px-2 py-1.5 focus-within:ring-2">
                  {collaborators.map((c) => (
                    <span
                      key={c}
                      className="bg-muted text-foreground inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
                    >
                      {c}
                      <button
                        type="button"
                        onClick={() =>
                          setCollaborators(
                            collaborators.filter((x) => x !== c),
                          )
                        }
                        className="hover:text-destructive"
                        aria-label={`Remove ${c}`}
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    id="pl-collab"
                    type="text"
                    value={collabDraft}
                    onChange={(e) => {
                      setCollabDraft(e.target.value);
                      setShowSuggestions(true);
                    }}
                    onKeyDown={onCollabKey}
                    onFocus={() => setShowSuggestions(true)}
                    // Delay so a suggestion-row mousedown can land before
                    // the dropdown unmounts. addCollaborator() on blur
                    // would race with the click handler otherwise.
                    onBlur={() =>
                      setTimeout(() => setShowSuggestions(false), 120)
                    }
                    placeholder={
                      collaborators.length === 0
                        ? "Search by ListenBrainz username"
                        : ""
                    }
                    autoComplete="off"
                    className="placeholder:text-muted-foreground/50 min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm focus:outline-none"
                  />
                </div>
                {showSuggestions && suggestions.length > 0 && (
                  <ul className="border-border/60 bg-popover absolute top-full right-0 left-0 z-10 mt-1 max-h-56 overflow-auto rounded-md border shadow-lg">
                    {suggestions.map((name, i) => (
                      <li key={name}>
                        <button
                          type="button"
                          // Use mousedown rather than click so the option
                          // is selected before the input blurs (which
                          // hides the dropdown).
                          onMouseDown={(e) => {
                            e.preventDefault();
                            addCollaborator(name);
                          }}
                          onMouseEnter={() => setActiveIdx(i)}
                          className={cn(
                            "block w-full px-3 py-1.5 text-left text-sm",
                            i === activeIdx
                              ? "bg-muted"
                              : "hover:bg-muted/60",
                          )}
                        >
                          {name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Field>

            {error && (
              <p className="text-destructive text-sm">{error}</p>
            )}

            <div
              className={cn(
                "border-border/60 -mx-5 -mb-4 flex justify-end gap-2 border-t px-5 py-3",
              )}
            >
              <Dialog.Close
                render={
                  <Button type="button" variant="outline" size="sm" />
                }
              >
                Cancel
              </Dialog.Close>
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}
