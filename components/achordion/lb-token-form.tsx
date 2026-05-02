"use client";

import { useActionState } from "react";
import {
  saveLbTokenAction,
  type SaveLbTokenState,
} from "@/app/(app)/settings/actions";
import { Check, AlertCircle, ExternalLink } from "lucide-react";

const initial: SaveLbTokenState = { status: "idle" };

export function LbTokenForm({ hasToken }: { hasToken: boolean }) {
  const [state, formAction, pending] = useActionState(saveLbTokenAction, initial);

  return (
    <form action={formAction} className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor="lb-token" className="block text-sm font-medium">
          ListenBrainz user token
        </label>
        <a
          href="https://listenbrainz.org/profile/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline"
        >
          Get my token
          <ExternalLink className="size-3" />
        </a>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="lb-token"
          name="token"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={
            hasToken ? "Paste a new token to replace the existing one" : "Paste your token"
          }
          required
          className="border-border/60 bg-background placeholder:text-muted-foreground/60 focus:ring-ring/30 h-10 flex-1 rounded-lg border px-3 text-sm outline-none focus:ring-2"
        />
        <button
          type="submit"
          disabled={pending}
          className="bg-primary text-primary-foreground inline-flex h-10 shrink-0 items-center justify-center rounded-lg px-4 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {state.status === "success" && (
        <p className="text-foreground inline-flex items-center gap-1.5 text-xs">
          <Check className="size-3" />
          Saved. Authenticated as{" "}
          <span className="font-medium">{state.userName}</span>.
        </p>
      )}
      {state.status === "error" && (
        <p className="text-destructive inline-flex items-center gap-1.5 text-xs">
          <AlertCircle className="size-3" />
          {state.message}
        </p>
      )}
    </form>
  );
}
