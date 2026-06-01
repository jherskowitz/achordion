import { Fragment, Suspense } from "react";
import Link from "next/link";
import { getUserTopArtists } from "@/lib/clients/listenbrainz";
import { artistHref } from "@/lib/entity-links";
import { OnAirIndicator } from "./on-air-indicator";
import { UserAvatar } from "./user-avatar";
import { cn } from "@/lib/utils";

/**
 * Shared user-card primitive used by both `<UserList>` (followers /
 * following) and `<SimilarUsersList>` (the explore similarity views).
 *
 * The card carries:
 *   - Avatar (size-9 grid, size-7 stack)
 *   - Username link → caller-provided `href` (defaults to the
 *     profile overview; the similar-users variant deep-links to
 *     `/user/<name>/stats`)
 *   - Single info slot — holds either the streamed "Currently into:
 *     A, B & C" line OR an `<OnAirIndicator>` widget. Slot has a
 *     reserved min-height so the card doesn't reflow when on-air
 *     content streams in. CSS in `globals.css` swaps the two via
 *     `:has(~ .on-air-pill)` so on-air takes precedence.
 *   - Optional trailing chip (the similarity tier on the explore
 *     variant; absent on follower / following lists where it
 *     wouldn't have meaning).
 *
 * Touch sizing is built in: the username link grows to text-base
 * on coarse pointers, and per-link padding inside the artists
 * line gives each artist its own tappable region. See AGENTS.md
 * §14 for the broader touch-sizing principles.
 */

async function CurrentlyInto({ username }: { username: string }) {
  const artists = await getUserTopArtists(username, "month", 3).catch(
    () => [] as Awaited<ReturnType<typeof getUserTopArtists>>,
  );
  const slice = artists.slice(0, 3);
  if (slice.length === 0) return null;
  return (
    <p
      className="currently-into-line text-muted-foreground/80 truncate text-xs pointer-coarse:text-sm"
      title={`Top artists this month: ${slice
        .map((a) => a.artist_name)
        .join(", ")}`}
    >
      <span className="text-muted-foreground/60">Currently into:</span>{" "}
      {slice.map((a, i) => (
        <Fragment key={`${a.artist_mbid ?? a.artist_name}-${i}`}>
          {i > 0 && (i === slice.length - 1 ? " & " : ", ")}
          <Link
            href={artistHref({
              mbid: a.artist_mbid ?? null,
              name: a.artist_name,
            })}
            prefetch={false}
            className="hover:text-foreground inline-block underline-offset-4 hover:underline pointer-coarse:px-1 pointer-coarse:py-1"
          >
            {a.artist_name}
          </Link>
        </Fragment>
      ))}
    </p>
  );
}

export interface UserCardProps {
  username: string;
  /** Where the username link goes. Defaults to the profile
   *  overview; pass `/user/<name>/stats` (or any path) to deep-link
   *  somewhere else. */
  href?: string;
  /** Optional trailing chip (label + Tailwind class string). The
   *  similar-users list passes a similarity-tier chip; followers /
   *  following lists omit. */
  tier?: { label: string; chipClass: string };
  /** "grid" — multi-column responsive cards (full page).
   *  "stack" — vertical list (sidebar). */
  layout?: "grid" | "stack";
  /** Optional Bluesky avatar override. Parent fetches via
   *  `resolveBskyAvatarsForUsers` and passes per-card so the avatar
   *  swaps from DiceBear to the linked Bluesky avatar. Omitted /
   *  undefined → DiceBear default. */
  avatarOverride?: string;
}

export function UserCard({
  username,
  href,
  tier,
  layout = "grid",
  avatarOverride,
}: UserCardProps) {
  const linkHref = href ?? `/user/${encodeURIComponent(username)}`;
  return (
    <li
      className={cn(
        "border-border/60 hover:border-foreground/30 hover:bg-muted/30 group flex items-center gap-3 rounded-xl border transition-colors",
        layout === "stack" ? "px-2.5 py-1.5" : "px-3 py-2.5",
      )}
    >
      <UserAvatar
        username={username}
        imageUrl={avatarOverride}
        className={layout === "stack" ? "size-7" : "size-9"}
        fallbackClassName={layout === "stack" ? "text-xs" : "text-sm"}
      />
      <div className="min-w-0 flex-1">
        {/* Username row — tier chip rides inline at the right
            edge instead of trailing the whole card. The previous
            layout (tier chip in a separate trailing slot) meant a
            "Somewhat similar" chip ate ~120px of fixed width on
            every viewport, leaving the "Currently into" line below
            with almost no room to render on phones — most artists
            ellipsised out of view. Inline tier keeps the chip
            visible without starving the artist line. */}
        <div className="flex items-baseline justify-between gap-2">
          <Link
            href={linkHref}
            prefetch={false}
            className="block min-w-0 py-0.5 pointer-coarse:py-1"
          >
            <p className="truncate text-sm font-medium pointer-coarse:text-base">
              {username}
            </p>
          </Link>
          {tier && (
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
                tier.chipClass,
              )}
            >
              {tier.label}
            </span>
          )}
        </div>
        {/* Single info slot — see component doc for the swap
            mechanics. Min-height reserves space for on-air so cards
            stay uniform; the artists fallback sits in the same slot
            and CSS hides it when on-air is present. */}
        <div className="mt-1 min-h-[20px] pointer-coarse:min-h-[28px]">
          {layout === "grid" && (
            <Suspense fallback={null}>
              <CurrentlyInto username={username} />
            </Suspense>
          )}
          <Suspense fallback={null}>
            <OnAirIndicator
              username={username}
              className="on-air-pill w-fit"
            />
          </Suspense>
        </div>
      </div>
    </li>
  );
}
