import { Suspense } from "react";
import Link from "next/link";
import { OnAirIndicator } from "./on-air-indicator";

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
              <div className="flex items-center justify-between">
                <span className="truncate">
                  <span className="text-muted-foreground/70 mr-2 text-xs tabular-nums">
                    {i + 1}
                  </span>
                  {l.user_name}
                </span>
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
              <OnAirIndicator
                username={l.user_name}
                className="mt-1"
              />
            </Suspense>
          </li>
        );
      })}
    </ol>
  );
}
