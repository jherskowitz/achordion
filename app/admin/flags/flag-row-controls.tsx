"use client";

import { useState, useTransition } from "react";
import { X, Plus } from "lucide-react";
import {
  setFlagDefault,
  addFlagUser,
  removeFlagUser,
} from "../actions";

/**
 * Per-flag controls: default-state radio + allowlist editor. Each
 * mutation goes through a server action and a `useTransition` is
 * used to disable the affected button while in flight. Errors get
 * surfaced inline below the controls.
 */
export function FlagRowControls({
  flagId,
  defaultValue,
  users,
}: {
  flagId: string;
  defaultValue: "on" | "off" | null;
  users: string[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newUser, setNewUser] = useState("");

  function call(promise: Promise<void>) {
    setError(null);
    startTransition(() => {
      promise.catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Unknown error.");
      });
    });
  }

  return (
    <div className="space-y-3">
      {/* Default-state radio. Three modes mirror the resolution order
          documented in lib/flags.ts: on / off / clear (fall through
          to allowlist). */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-xs">Default:</span>
        <DefaultButton
          flagId={flagId}
          value="on"
          active={defaultValue === "on"}
          pending={pending}
          onClick={() => call(setFlagDefault(flagId, "on"))}
        >
          On
        </DefaultButton>
        <DefaultButton
          flagId={flagId}
          value="off"
          active={defaultValue === "off"}
          pending={pending}
          onClick={() => call(setFlagDefault(flagId, "off"))}
        >
          Off
        </DefaultButton>
        <DefaultButton
          flagId={flagId}
          value="clear"
          active={defaultValue === null}
          pending={pending}
          onClick={() => call(setFlagDefault(flagId, "clear"))}
        >
          Clear (allowlist mode)
        </DefaultButton>
      </div>

      {/* Allowlist. Visible regardless of default state — admins
          sometimes want to maintain the allowlist while default=on,
          so flipping default=off (kill switch) preserves the
          dogfood cohort for fast recovery. */}
      <div className="space-y-1.5">
        <p className="text-muted-foreground text-xs">Allowlist users:</p>
        {users.length === 0 ? (
          <p className="text-muted-foreground/70 text-xs italic">
            None.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {users.map((u) => (
              <li key={u}>
                <span className="border-border/60 bg-muted/40 inline-flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-2.5 text-xs">
                  {u}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => call(removeFlagUser(flagId, u))}
                    className="hover:bg-foreground/10 inline-flex size-5 items-center justify-center rounded-full transition-colors disabled:opacity-50"
                    aria-label={`Remove ${u}`}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = newUser.trim();
            if (!trimmed) return;
            call(addFlagUser(flagId, trimmed));
            setNewUser("");
          }}
        >
          <input
            type="text"
            value={newUser}
            onChange={(e) => setNewUser(e.target.value)}
            placeholder="mb-username"
            className="border-border/60 bg-background placeholder:text-muted-foreground/60 focus:ring-ring/30 h-7 w-40 rounded-md border px-2 text-xs outline-none focus:ring-2"
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={pending || !newUser.trim()}
            className="hover:bg-muted/40 inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs disabled:opacity-50"
          >
            <Plus className="size-3" />
            Add
          </button>
        </form>
      </div>

      {error && (
        <p className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}

function DefaultButton({
  active,
  pending,
  onClick,
  children,
}: {
  flagId: string;
  value: "on" | "off" | "clear";
  active: boolean;
  pending: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={pending}
      onClick={onClick}
      className={
        active
          ? "bg-primary text-primary-foreground inline-flex h-7 items-center rounded-md px-2.5 text-xs font-medium disabled:opacity-50"
          : "border-border/60 hover:bg-muted/40 inline-flex h-7 items-center rounded-md border px-2.5 text-xs disabled:opacity-50"
      }
    >
      {children}
    </button>
  );
}
