import { KNOWN_FLAGS, getFlagState, type FlagState } from "@/lib/flags";
import { FlagRowControls } from "./flag-row-controls";

export const metadata = { title: "Feature flags · Admin" };

export const dynamic = "force-dynamic";

export default async function FlagsAdminPage() {
  // Pull state for every known flag in parallel. Each call is one
  // Upstash GET + one SMEMBERS — small.
  const states: Array<{ id: string; label: string; description: string; state: FlagState | null }> =
    await Promise.all(
      KNOWN_FLAGS.map(async (f) => ({
        id: f.id,
        label: f.label,
        description: f.description,
        state: await getFlagState(f.id),
      })),
    );

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm leading-6">
        Each flag resolves as: <code>default=on</code> →
        everyone; <code>default=off</code> → kill-switch; otherwise
        the allowlist. Clear the default to fall back to allowlist
        mode.
      </p>
      <ul className="space-y-3">
        {states.map((f) => (
          <li
            key={f.id}
            className="border-border/60 space-y-3 rounded-xl border p-4"
          >
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">
                  {f.label}{" "}
                  <code className="text-muted-foreground text-xs font-normal">
                    {f.id}
                  </code>
                </h2>
                <p className="text-muted-foreground mt-1 text-xs leading-5">
                  {f.description}
                </p>
              </div>
              <CurrentState state={f.state} />
            </header>
            {f.state === null ? (
              <p className="text-muted-foreground/80 text-xs">
                Upstash isn&apos;t configured in this environment.
                Flag controls disabled.
              </p>
            ) : (
              <FlagRowControls
                flagId={f.id}
                defaultValue={f.state.defaultValue}
                users={f.state.users}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CurrentState({ state }: { state: FlagState | null }) {
  if (state === null) {
    return (
      <span className="text-muted-foreground/80 inline-flex h-6 items-center rounded-full bg-muted px-2 text-[11px]">
        Unavailable
      </span>
    );
  }
  if (state.defaultValue === "on") {
    return (
      <span className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-medium">
        Everyone
      </span>
    );
  }
  if (state.defaultValue === "off") {
    return (
      <span className="bg-destructive/15 text-destructive inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-medium">
        Kill switch
      </span>
    );
  }
  const n = state.users.length;
  return (
    <span className="bg-muted/60 text-foreground inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-medium">
      Allowlist · {n} user{n === 1 ? "" : "s"}
    </span>
  );
}
