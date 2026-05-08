import { Suspense } from "react";
import Link from "next/link";
import { OnAirIndicator } from "./on-air-indicator";
import { UserAvatar } from "./user-avatar";

interface ListenerEntry {
  user_name: string;
  listen_count: number;
}

export function TopListenersList({
  listeners,
  /** "stack" — narrow vertical list (default; sidebar use).
   *  "cards" — multi-column responsive bordered cards for full-width
   *  page sections. */
  layout = "stack",
}: {
  listeners: ListenerEntry[];
  layout?: "stack" | "cards";
}) {
  if (listeners.length === 0) return null;
  const max = listeners[0]?.listen_count ?? 1;
  if (layout === "cards") {
    return (
      <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {listeners.slice(0, 12).map((l, i) => {
          const pct = Math.round((l.listen_count / max) * 100);
          return (
            <li
              key={l.user_name}
              className="border-border/60 hover:border-foreground/30 hover:bg-muted/30 group flex flex-col gap-2 rounded-xl border p-3 transition-colors"
            >
              {/* Two-row layout inside the card:
                    line 1: rank + avatar + username + count
                    line 2: progress bar spanning the username column
                  Count was previously a sibling of the avatar/
                  username column with `self-start`, which floated
                  it above the row's vertical center and visually
                  detached it from the username. Pairing username
                  and count on the same baseline matches the stack
                  layout below and reads cleanly. */}
              <Link
                href={`/user/${encodeURIComponent(l.user_name)}`}
                className="flex min-w-0 items-center gap-3"
              >
                <span className="text-muted-foreground/70 w-5 shrink-0 text-xs tabular-nums">
                  {i + 1}
                </span>
                <UserAvatar
                  username={l.user_name}
                  className="size-9 shrink-0"
                  fallbackClassName="text-sm"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">
                      {l.user_name}
                    </p>
                    <span className="text-muted-foreground shrink-0 tabular-nums text-xs">
                      {l.listen_count.toLocaleString()}
                    </span>
                  </div>
                  <div className="bg-muted mt-1.5 h-0.5 w-full overflow-hidden rounded-full">
                    <div
                      className="bg-foreground/60 h-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </Link>
              <Suspense fallback={null}>
                <OnAirIndicator username={l.user_name} />
              </Suspense>
            </li>
          );
        })}
      </ol>
    );
  }
  return (
    <ol className="space-y-1.5">
      {listeners.slice(0, 10).map((l, i) => {
        const pct = Math.round((l.listen_count / max) * 100);
        return (
          <li
            key={l.user_name}
            className="hover:bg-muted/40 -mx-2 rounded-md px-2 py-1.5 text-sm"
          >
            <Link
              href={`/user/${encodeURIComponent(l.user_name)}`}
              className="block"
            >
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground/70 w-4 shrink-0 text-xs tabular-nums">
                  {i + 1}
                </span>
                <UserAvatar
                  username={l.user_name}
                  className="size-6 shrink-0"
                  fallbackClassName="text-[10px]"
                />
                <span className="min-w-0 flex-1 truncate">{l.user_name}</span>
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                  {l.listen_count.toLocaleString()}
                </span>
              </div>
              <div className="bg-muted mt-1 h-0.5 w-full overflow-hidden rounded-full">
                <div
                  className="bg-foreground/60 h-full"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </Link>
            <Suspense fallback={null}>
              {/* Indent past the rank (w-4) + first gap (gap-2) so
                  the now-playing line aligns under the avatar's
                  left edge — feels visually anchored to the
                  person, not floating mid-row under the username
                  text. */}
              <OnAirIndicator
                username={l.user_name}
                className="mt-1 ml-6"
              />
            </Suspense>
          </li>
        );
      })}
    </ol>
  );
}
