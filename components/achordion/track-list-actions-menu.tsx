"use client";

import type { ReactNode } from "react";
import { Download, ListPlus, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  parachordImportPlaylist,
  type ParachordTrack,
} from "@/lib/parachord";

export type TrackListActionsMenuProps = {
  /** Title of the list — shown to Parachord on import + used in toasts. */
  title: string;
  /** Owner / curator name. Defaults to "Achordion". */
  creator?: string;
  /** Tracks fed to the parachord:// import URL. */
  tracks: ParachordTrack[];
  /** When supplied, renders a Download XSPF item linking here. */
  xspfUrl?: string;
  /** Suggested filename for the XSPF download (sans extension). */
  xspfFilename?: string;
  /**
   * Surface-specific items rendered above the common ones — e.g. on a
   * playlist page: Edit playlist + Add collaborator. Each child should
   * be a `<DropdownMenuItem>` (or fragment of items) so it composes
   * cleanly with the shared menu shell.
   */
  extraItems?: ReactNode;
  /** aria-label for the trigger button. Defaults to "List actions". */
  triggerLabel?: string;
  /** Pass through to the trigger button for layout tweaks. */
  className?: string;
};

/**
 * List-level overflow menu, sits next to the "Play in Parachord" CTA
 * on any surface that renders a list of tracks (playlist, recently
 * played, loved, top tracks, feed). Distinct from `<TrackActionsMenu>`,
 * which lives per-row.
 */
export function TrackListActionsMenu({
  title,
  creator,
  tracks,
  xspfUrl,
  xspfFilename,
  extraItems,
  triggerLabel = "List actions",
  className,
}: TrackListActionsMenuProps) {
  const canSaveToParachord = tracks.length > 0;
  const importHref = canSaveToParachord
    ? parachordImportPlaylist({ title, creator, tracks })
    : "";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={triggerLabel}
            className={className}
          >
            <MoreVertical className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        {extraItems ? (
          <>
            <DropdownMenuGroup>{extraItems}</DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuGroup>
          {canSaveToParachord && (
            <DropdownMenuItem
              render={
                <a href={importHref}>
                  <ListPlus />
                  Save to Parachord
                </a>
              }
            />
          )}
          {xspfUrl && (
            <DropdownMenuItem
              render={
                <a
                  href={xspfUrl}
                  download={xspfFilename ? `${xspfFilename}.xspf` : true}
                >
                  <Download />
                  Download XSPF
                </a>
              }
            />
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
