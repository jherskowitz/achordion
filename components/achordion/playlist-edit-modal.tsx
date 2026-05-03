"use client";

import {
  useEffect,
  useState,
  useTransition,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { Pencil, X } from "lucide-react";
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
export function PlaylistEditButton({
  mbid,
  initial,
}: {
  mbid: string;
  initial: {
    title: string;
    annotation: string;
    isPublic: boolean;
    collaborators: string[];
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(initial.title);
  const [annotation, setAnnotation] = useState(initial.annotation);
  const [isPublic, setIsPublic] = useState(initial.isPublic);
  const [collaborators, setCollaborators] = useState<string[]>(
    initial.collaborators,
  );
  const [collabDraft, setCollabDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Re-seed local state when the modal opens, so reopening after a
  // server-side change (or cancel-then-reopen) reflects the latest
  // values rather than a stale draft.
  useEffect(() => {
    if (open) {
      setTitle(initial.title);
      setAnnotation(initial.annotation);
      setIsPublic(initial.isPublic);
      setCollaborators(initial.collaborators);
      setCollabDraft("");
      setError(null);
    }
  }, [open, initial]);

  function addCollaborator() {
    const trimmed = collabDraft.trim();
    if (!trimmed) return;
    if (collaborators.some((c) => c.toLowerCase() === trimmed.toLowerCase()))
      return;
    setCollaborators([...collaborators, trimmed]);
    setCollabDraft("");
  }

  function onCollabKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addCollaborator();
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
      <Dialog.Trigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 rounded-full"
          />
        }
      >
        <Pencil className="size-3.5" />
        Edit
      </Dialog.Trigger>
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
                  onChange={(e) => setCollabDraft(e.target.value)}
                  onKeyDown={onCollabKey}
                  onBlur={addCollaborator}
                  placeholder={
                    collaborators.length === 0
                      ? "MusicBrainz username, then Enter"
                      : ""
                  }
                  className="placeholder:text-muted-foreground/50 min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm focus:outline-none"
                />
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
