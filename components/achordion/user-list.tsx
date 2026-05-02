import { Suspense } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { OnAirIndicator } from "./on-air-indicator";

export function UserList({
  users,
  emptyMessage = "Nothing here yet.",
}: {
  users: string[];
  emptyMessage?: string;
}) {
  if (users.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        {emptyMessage}
      </p>
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {users.map((name) => (
        <li
          key={name}
          className="border-border/60 hover:border-foreground/30 hover:bg-muted/30 flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors"
        >
          <Avatar className="size-9">
            <AvatarFallback className="text-sm">
              {name.slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <Link
              href={`/user/${encodeURIComponent(name)}`}
              className="block truncate text-sm font-medium"
            >
              {name}
            </Link>
            <Suspense fallback={null}>
              <OnAirIndicator username={name} className="mt-1" />
            </Suspense>
          </div>
        </li>
      ))}
    </ul>
  );
}
