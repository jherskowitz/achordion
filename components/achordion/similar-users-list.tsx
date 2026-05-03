import { Suspense } from "react";
import Link from "next/link";
import type { SimilarUser } from "@/lib/clients/listenbrainz";
import { OnAirIndicator } from "./on-air-indicator";
import { UserAvatar } from "./user-avatar";
import { cn } from "@/lib/utils";

interface SimilarUsersListProps {
  users: SimilarUser[];
  /** "grid" — multi-column responsive cards (full page).
   *  "stack" — vertical list (sidebar). */
  layout?: "grid" | "stack";
}

export function SimilarUsersList({
  users,
  layout = "grid",
}: SimilarUsersListProps) {
  if (users.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No similar users on file yet.
      </p>
    );
  }
  const wrapperClass =
    layout === "stack"
      ? "space-y-1.5"
      : "grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3";
  return (
    <ul className={wrapperClass}>
      {users.map((u) => {
        const pct = Math.round(u.similarity * 100);
        return (
          <li
            key={u.user_name}
            className={cn(
              "border-border/60 hover:border-foreground/30 hover:bg-muted/30 group flex items-center gap-3 rounded-xl border transition-colors",
              layout === "stack" ? "px-2.5 py-1.5" : "px-3 py-2.5",
            )}
          >
            <UserAvatar
              username={u.user_name}
              className={layout === "stack" ? "size-7" : "size-9"}
              fallbackClassName={layout === "stack" ? "text-xs" : "text-sm"}
            />
            <div className="min-w-0 flex-1">
              <Link
                href={`/user/${encodeURIComponent(u.user_name)}`}
                className="block min-w-0"
              >
                <p className="truncate text-sm font-medium">{u.user_name}</p>
                <div className="bg-muted mt-1 h-0.5 w-full overflow-hidden rounded-full">
                  <div
                    className="bg-foreground/60 h-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </Link>
              <Suspense fallback={null}>
                <OnAirIndicator
                  username={u.user_name}
                  className="mt-1.5"
                />
              </Suspense>
            </div>
            <span className="text-muted-foreground/70 shrink-0 self-start tabular-nums text-xs">
              {pct}%
            </span>
          </li>
        );
      })}
    </ul>
  );
}
