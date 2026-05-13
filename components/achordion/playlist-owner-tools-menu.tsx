"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, UserPlus } from "lucide-react";
import { Dialog } from "@base-ui/react/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { TrackListActionsMenu } from "./track-list-actions-menu";
import { PlaylistEditDialog } from "./playlist-edit-modal";
import { deletePlaylistAction } from "@/app/(app)/playlist/[mbid]/actions";
import type { ParachordTrack } from "@/lib/parachord";

/**
 * Playlist-page list-actions menu — composes the shared
 * <TrackListActionsMenu> with playlist-only items (Edit, Add
 * collaborator, Delete playlist) and owns the controlled state for
 * the underlying <PlaylistEditDialog> + delete-confirm modal.
 *
 * Edit and Add collaborator open the same dialog. v1.1 can
 * scroll-into-view the collaborator field when invoked from the
 * Add-collaborator item.
 *
 * Delete is gated behind a confirm dialog because ListenBrainz
 * playlist deletion is permanent — there's no LB-side undo and we
 * don't snapshot the playlist anywhere before the call. After a
 * successful delete the user is redirected to their playlists tab
 * so they don't sit on a now-404 page.
 */
export function PlaylistOwnerToolsMenu({
  mbid,
  owner,
  initial,
  tracks,
  xspfUrl,
  xspfFilename,
}: {
  mbid: string;
  owner: string | null;
  initial: {
    title: string;
    annotation: string;
    isPublic: boolean;
    collaborators: string[];
  };
  tracks: ParachordTrack[];
  xspfUrl: string;
  xspfFilename: string;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleConfirmDelete() {
    setDeleteError(null);
    startTransition(async () => {
      const result = await deletePlaylistAction(mbid);
      if (!result.ok) {
        setDeleteError(result.reason);
        return;
      }
      setConfirmDeleteOpen(false);
      router.push(result.redirectTo);
      router.refresh();
    });
  }

  return (
    <>
      <TrackListActionsMenu
        title={initial.title}
        creator={owner ?? undefined}
        tracks={tracks}
        xspfUrl={xspfUrl}
        xspfFilename={xspfFilename}
        triggerLabel="Playlist actions"
        extraItems={
          <>
            <DropdownMenuItem onClick={() => setEditOpen(true)}>
              <Pencil />
              Edit playlist
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setEditOpen(true)}>
              <UserPlus />
              Add collaborator
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setDeleteError(null);
                setConfirmDeleteOpen(true);
              }}
              // Destructive tone so the menu item reads as the
              // dangerous action it is — same colour treatment the
              // rest of the app uses for "remove" / "delete" items.
              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            >
              <Trash2 />
              Delete playlist
            </DropdownMenuItem>
          </>
        }
      />
      <PlaylistEditDialog
        mbid={mbid}
        owner={owner}
        initial={initial}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <Dialog.Root
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs" />
          <Dialog.Popup className="bg-popover text-popover-foreground border-border/60 fixed top-1/2 left-1/2 z-50 w-[min(95vw,440px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border shadow-xl transition duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0">
            <div className="space-y-3 px-5 py-4">
              <Dialog.Title className="text-base font-medium">
                Delete this playlist?
              </Dialog.Title>
              <Dialog.Description className="text-muted-foreground text-sm leading-6">
                <span className="text-foreground">{initial.title}</span>{" "}
                will be permanently deleted from ListenBrainz. This
                can&apos;t be undone.
              </Dialog.Description>
              {deleteError && (
                <p className="text-destructive text-sm">{deleteError}</p>
              )}
            </div>
            <div className="border-border/60 -mt-1 flex justify-end gap-2 border-t px-5 py-3">
              <Dialog.Close
                render={
                  <Button type="button" variant="outline" size="sm" />
                }
                disabled={pending}
              >
                Cancel
              </Dialog.Close>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleConfirmDelete}
                disabled={pending}
              >
                {pending ? "Deleting…" : "Delete playlist"}
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
