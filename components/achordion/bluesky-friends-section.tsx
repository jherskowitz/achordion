import Link from "next/link";
import { findBlueskyFriends } from "@/lib/bsky-display";

/**
 * "Bluesky friends on Achordion" surface for the settings page.
 *
 * Walks the viewer's Bluesky follow graph and surfaces the subset
 * who've also linked their Bluesky to an Achordion profile. Renders
 * null when there are no matches — early-adopter mode is going to
 * have stretches of zero results, and an empty section reading
 * "No matches yet" eats more visual weight than it justifies.
 *
 * Viewer-only by construction (calls `findBlueskyFriends` which
 * requires the auth'd viewer's own bsky link). Never rendered on
 * other people's profile pages.
 *
 * Each card shows the friend's Bluesky avatar + display name, with
 * the Achordion username as the click target — the goal here is to
 * land them on their friend's Achordion profile, not on Bluesky.
 */
export async function BlueskyFriendsSection({ viewer }: { viewer: string }) {
  const friends = await findBlueskyFriends(viewer);
  if (friends.length === 0) return null;
  return (
    <section className="space-y-3">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">
          Bluesky friends on Achordion
        </h3>
        <span className="text-muted-foreground/80 text-xs">
          {friends.length} {friends.length === 1 ? "match" : "matches"}
        </span>
      </header>
      <p className="text-muted-foreground text-sm leading-6">
        People you follow on Bluesky who&apos;ve also linked their
        Achordion profile. Click through to their listening.
      </p>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {friends.map((f) => (
          <li key={f.lbUsername}>
            <Link
              href={`/user/${f.lbUsername}`}
              className="border-border/60 bg-card/30 hover:bg-card/60 flex items-center gap-3 rounded-lg border p-2.5 transition-colors"
            >
              {f.bskyAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={f.bskyAvatar}
                  alt=""
                  width={36}
                  height={36}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="size-9 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="bg-muted size-9 shrink-0 rounded-full" />
              )}
              <div className="min-w-0 text-sm leading-tight">
                <p className="truncate font-medium">{f.lbUsername}</p>
                <p className="text-muted-foreground truncate text-xs">
                  {f.bskyDisplayName ?? `@${f.bskyHandle}`}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
