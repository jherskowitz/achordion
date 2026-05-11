"use client";

import { useState } from "react";
import { Code2, Check, Copy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * "Embed" affordance for entity pages — opens a dialog with a
 * ready-to-copy iframe snippet that drops Achordion's widget into a
 * third-party page.
 *
 * Supports two entity types today:
 *   - `track` (recording MBID) → `/embed/track/<mbid>`, 600×180.
 *   - `album` (release-group MBID) → `/embed/album/<mbid>`, 600×260
 *     baseline. Has an expandable tracklist so the snippet's host
 *     iframe should accommodate the expanded height with internal
 *     scroll if needed.
 *
 * Defaults are tuned to the most common embed shape; consumers can
 * override via `recommendedHeight` if they have a more specific
 * surface in mind (e.g. a sidebar column).
 */
type EmbedEntity = "track" | "album";

const DEFAULT_HEIGHT: Record<EmbedEntity, number> = {
  track: 180,
  album: 260,
};

/** Minimal HTML-attribute escape for the iframe `title=` value.
 *  Track / album names occasionally carry `"` and `&` (and rarely
 *  `<`); breaking the snippet into invalid HTML when a user pastes
 *  it into their site would be embarrassing. */
function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function EmbedShareButton({
  entity,
  mbid,
  entityName,
  artistName,
  recommendedHeight,
}: {
  entity: EmbedEntity;
  mbid: string;
  /** Track or album title — flows into the iframe's `title` attr
   *  alongside the artist name. Falls back to a generic
   *  "Achordion track" / "Achordion album" when missing. */
  entityName?: string;
  /** Primary credited artist. Joined into the iframe title with
   *  an em-dash. Optional for the "Various Artists" / no-credit
   *  edge case. */
  artistName?: string;
  recommendedHeight?: number;
}) {
  const [copied, setCopied] = useState(false);
  // Embedder picks the theme up-front; the iframe URL carries it
  // and the embed page reads it server-side. Default mirrors the
  // dark-by-default look the embed has shipped with so existing
  // snippets render identically without a theme param.
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  // The snippet ALWAYS hard-codes achordion.xyz — users copy it
  // for external pages, so it shouldn't reflect the dev origin.
  // The Preview link below uses the CURRENT origin so dev works
  // without a deploy.
  const pathBase = `/embed/${entity}/${mbid}`;
  const pathWithTheme = `${pathBase}?theme=${theme}`;
  const snippetSrc = `https://achordion.xyz${pathWithTheme}`;
  const previewHref =
    typeof window !== "undefined"
      ? window.location.origin + pathWithTheme
      : snippetSrc;
  const height = recommendedHeight ?? DEFAULT_HEIGHT[entity];
  // Prefer "Track Name — Artist" / "Album Name — Artist" so screen
  // readers and host-page hover-text describe the embed by what it
  // actually plays, not the generic "Achordion track" stand-in.
  // Quote-escape because user-supplied names occasionally include
  // double-quotes (mostly in song titles like `Q "U" E`).
  const titleAttr = escapeAttr(
    entityName && artistName
      ? `${entityName} — ${artistName}`
      : entityName ?? `Achordion ${entity}`,
  );
  const snippet = `<iframe src="${snippetSrc}" width="600" height="${height}" loading="lazy" style="border:0;border-radius:12px" title="${titleAttr}"></iframe>`;

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be blocked in some contexts; silently
      // ignore — the textarea is still selectable.
    }
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            size="sm"
            nativeButton={false}
            className="text-muted-foreground hover:text-foreground inline-flex h-7 items-center gap-1.5 rounded-md bg-transparent px-2 text-xs underline-offset-4 hover:underline"
          >
            <Code2 className="size-3.5" />
            Embed
          </Button>
        }
      />

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Embed this {entity}</DialogTitle>
          <DialogDescription>
            Drop this snippet into any page to display the
            Achordion widget — no account or API needed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {/* Theme radio. Two-pill toggle so the choice is visible
              at a glance rather than tucked into a select. Updates
              the iframe `src` immediately — preview link + clipboard
              snippet both reflect whatever's selected. */}
          <div className="space-y-1.5">
            <p className="text-muted-foreground text-xs">Background</p>
            <div className="bg-muted/40 inline-flex rounded-md p-0.5 text-xs">
              {(["dark", "light"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTheme(t)}
                  className={cn(
                    "inline-flex h-7 items-center rounded px-3 capitalize transition-colors",
                    theme === t
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <textarea
            readOnly
            value={snippet}
            rows={3}
            onFocus={(e) => e.currentTarget.select()}
            className="border-border/60 bg-muted/40 w-full resize-none rounded-md border p-3 font-mono text-xs"
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={copyToClipboard}
              className="inline-flex items-center gap-1.5"
            >
              {copied ? (
                <Check className="size-4" />
              ) : (
                <Copy className="size-4" />
              )}
              {copied ? "Copied" : "Copy code"}
            </Button>
            <a
              href={previewHref}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "text-muted-foreground hover:text-foreground text-xs",
                "underline-offset-4 hover:underline",
              )}
            >
              Preview the widget →
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
