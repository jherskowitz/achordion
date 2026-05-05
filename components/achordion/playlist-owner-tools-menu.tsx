"use client";

import { useState } from "react";
import { Pencil, UserPlus } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { TrackListActionsMenu } from "./track-list-actions-menu";
import { PlaylistEditDialog } from "./playlist-edit-modal";
import type { ParachordTrack } from "@/lib/parachord";

/**
 * Playlist-page list-actions menu — composes the shared
 * <TrackListActionsMenu> with playlist-only items (Edit, Add
 * collaborator) and owns the controlled state for the underlying
 * <PlaylistEditDialog>.
 *
 * Both Edit and Add collaborator open the same dialog. v1.1 can
 * scroll-into-view the collaborator field when invoked from the
 * Add-collaborator item.
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
  const [editOpen, setEditOpen] = useState(false);

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
    </>
  );
}
