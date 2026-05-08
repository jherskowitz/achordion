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
 * ready-to-copy iframe snippet that drops Achordion's track widget
 * into a third-party page. The widget itself lives at
 * `/embed/track/<mbid>` (see `app/embed/track/[mbid]/page.tsx`).
 *
 * Recommended dimensions: 600×180 baseline; the widget responds
 * down to ~360px wide for narrow column embeds.
 */
export function EmbedShareButton({
  entity,
  mbid,
  recommendedHeight = 180,
}: {
  entity: "track";
  mbid: string;
  recommendedHeight?: number;
}) {
  const [copied, setCopied] = useState(false);
  // The snippet ALWAYS hard-codes achordion.xyz — users copy it
  // for external pages, so it shouldn't reflect the dev origin.
  // The Preview link below uses the CURRENT origin so dev works
  // without a deploy.
  const path = `/embed/${entity}/${mbid}`;
  const snippetSrc = `https://achordion.xyz${path}`;
  const previewHref =
    typeof window !== "undefined" ? window.location.origin + path : snippetSrc;
  const snippet = `<iframe src="${snippetSrc}" width="600" height="${recommendedHeight}" loading="lazy" style="border:0;border-radius:12px" title="Achordion ${entity}"></iframe>`;

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
