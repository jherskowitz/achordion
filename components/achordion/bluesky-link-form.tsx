"use client";

import { useActionState } from "react";
import { AlertCircle, Check, ExternalLink } from "lucide-react";
import {
  linkBlueskyAction,
  type LinkBskyState,
} from "@/app/(app)/settings/actions";

const initial: LinkBskyState = { status: "idle" };

interface Props {
  /** Achordion profile URL the user must paste into their Bluesky bio. */
  expectedUrl: string;
}

export function BlueskyLinkForm({ expectedUrl }: Props) {
  const [state, formAction, pending] = useActionState(linkBlueskyAction, initial);

  return (
    <form action={formAction} className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor="bsky-handle" className="block text-sm font-medium">
          Bluesky handle
        </label>
        <a
          href="https://bsky.app/settings/account"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline"
        >
          Edit my Bluesky bio
          <ExternalLink className="size-3" />
        </a>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="bsky-handle"
          name="handle"
          type="text"
          inputMode="email"
          autoComplete="off"
          spellCheck={false}
          autoCapitalize="off"
          placeholder="jherskowitz.bsky.social or jherskowitz.com"
          required
          className="border-border/60 bg-background placeholder:text-muted-foreground/60 focus:ring-ring/30 h-10 flex-1 rounded-lg border px-3 text-sm outline-none focus:ring-2"
        />
        <button
          type="submit"
          disabled={pending}
          className="bg-primary text-primary-foreground inline-flex h-10 shrink-0 items-center justify-center rounded-lg px-4 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Verifying…" : "Verify"}
        </button>
      </div>
      <div className="text-muted-foreground space-y-2 text-xs leading-5">
        <p>
          Before you click Verify, paste this URL anywhere in your Bluesky
          bio so we can confirm both sides own the link:
        </p>
        <code className="border-border/60 bg-muted/40 block break-all rounded-md border px-2 py-1.5 font-mono text-[11px]">
          {expectedUrl}
        </code>
        <p>
          Custom-domain handles (e.g. <code>jherskowitz.com</code>) work
          here just like <code>*.bsky.social</code> ones.
        </p>
      </div>
      {state.status === "success" && (
        <p className="text-foreground inline-flex items-center gap-1.5 text-xs">
          <Check className="size-3" />
          Linked to{" "}
          <span className="font-medium">@{state.handle}</span>.
        </p>
      )}
      {state.status === "error" && (
        <div className="text-destructive space-y-1 text-xs leading-5">
          <p className="inline-flex items-center gap-1.5">
            <AlertCircle className="size-3" />
            {state.message}
          </p>
          {state.expectedUrl && (
            <p className="text-muted-foreground">
              Expected to find{" "}
              <code className="font-mono text-[11px]">
                {state.expectedUrl}
              </code>{" "}
              in your Bluesky bio. Save the bio change, then try again.
            </p>
          )}
        </div>
      )}
    </form>
  );
}
