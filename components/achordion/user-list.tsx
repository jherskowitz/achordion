import { UserCard } from "./user-card";

/**
 * Generic user-grid for followers / following lists. Wraps the
 * shared `<UserCard>` so cards look identical to the explore
 * similar-users variant — same avatar, "Currently into" line,
 * on-air slot, touch sizing — minus the tier chip (similarity
 * isn't a meaningful concept in a follower / following context).
 */
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
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {users.map((name) => (
        <UserCard key={name} username={name} layout="grid" />
      ))}
    </ul>
  );
}
