import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { SimilarUser } from "@/lib/clients/listenbrainz";

export function SimilarUsersList({ users }: { users: SimilarUser[] }) {
  if (users.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No similar users on file yet.
      </p>
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {users.map((u) => {
        const pct = Math.round(u.similarity * 100);
        return (
          <li key={u.user_name}>
            <Link
              href={`/user/${encodeURIComponent(u.user_name)}`}
              className="border-border/60 hover:border-foreground/30 hover:bg-muted/30 group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors"
            >
              <Avatar className="size-9">
                <AvatarFallback className="text-sm">
                  {u.user_name.slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{u.user_name}</p>
                <div className="bg-muted mt-1 h-0.5 w-full overflow-hidden rounded-full">
                  <div
                    className="bg-foreground/60 h-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              <span className="text-muted-foreground/70 shrink-0 tabular-nums text-xs">
                {pct}%
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
