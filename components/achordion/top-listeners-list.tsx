import { Suspense } from "react";
import Link from "next/link";
import { OnAirIndicator } from "./on-air-indicator";
import { UserAvatar } from "./user-avatar";

interface ListenerEntry {
  user_name: string;
  listen_count: number;
}

export function TopListenersList({ listeners }: { listeners: ListenerEntry[] }) {
  if (listeners.length === 0) return null;
  const max = listeners[0]?.listen_count ?? 1;
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
              {/* Indent past the rank (w-4) + first gap (gap-2) +
                  avatar (size-6) + second gap (gap-2) = 3.5rem so
                  the now-playing line aligns with the username
                  start, not the row edge. ml-12 (3rem) was off by
                  the second gap. */}
              <OnAirIndicator
                username={l.user_name}
                className="mt-1 ml-14"
              />
            </Suspense>
          </li>
        );
      })}
    </ol>
  );
}
