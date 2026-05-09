import type { SimilarUser } from "@/lib/clients/listenbrainz";
import { UserCard } from "./user-card";

interface SimilarUsersListProps {
  users: SimilarUser[];
  /** "grid" — multi-column responsive cards (full page).
   *  "stack" — vertical list (sidebar). */
  layout?: "grid" | "stack";
}

/** Bucket users into three qualitative tiers based on their rank
 *  within the visible cohort. Avoids the "we only share 36% of our
 *  taste" misread that comes from displaying LB's raw similarity
 *  field as a percentage — that field is a 0-1 relative ranking
 *  score that even for the most similar listener typically caps
 *  around 0.3-0.4. Tier label + colour is the honest unit. */
function tierFor(index: number, total: number): {
  label: string;
  chipClass: string;
} {
  // 0 (most similar) → 1 (least similar) within the cohort.
  // Even thirds: top 1/3 highly, middle 1/3 similar, bottom 1/3
  // somewhat. Single-element edge case lands in the highly bucket.
  const rank = total <= 1 ? 0 : index / (total - 1);
  if (rank < 1 / 3) {
    return {
      label: "Highly similar",
      chipClass: "bg-primary/15 text-primary",
    };
  }
  if (rank < 2 / 3) {
    return {
      label: "Similar",
      chipClass: "bg-foreground/10 text-foreground",
    };
  }
  return {
    label: "Somewhat similar",
    chipClass: "bg-muted text-muted-foreground",
  };
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
  // Grid: stay 2-up at lg so the longer tier chip
  // ("Somewhat similar") doesn't squeeze the username column at
  // narrow grid breakpoints. Bumps to 3-up at xl where there's
  // genuinely room. Stack stays vertical for sidebar use.
  const wrapperClass =
    layout === "stack"
      ? "space-y-1.5"
      : "grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3";
  return (
    <ul className={wrapperClass}>
      {users.map((u, i) => (
        <UserCard
          key={u.user_name}
          username={u.user_name}
          // Deep-link to stats — when scanning similar listeners the
          // question is "how do their top artists / albums / tracks
          // compare to mine?", not "what's their profile overview
          // look like?".
          href={`/user/${encodeURIComponent(u.user_name)}/stats`}
          tier={tierFor(i, users.length)}
          layout={layout}
        />
      ))}
    </ul>
  );
}
