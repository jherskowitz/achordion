import { Suspense } from "react";
import { UserAvatar } from "./user-avatar";
import { auth } from "@/auth";
import { getFollowing, getPlayingNow } from "@/lib/clients/listenbrainz";
import { getLbTokenForRequest } from "@/lib/lb-token";
import { getBskyDisplayProfile } from "@/lib/bsky-display";
import { BlueskyStrip } from "./bluesky-strip";
import { FollowToggle } from "./follow-toggle";
import { LiveOnAirIndicator } from "./live-on-air-indicator";
import { SectionTabs, type SectionTab } from "./section-tabs";
import { UserStatsRadioWidget } from "./user-stats-radio-widget";

function userTabs(name: string): SectionTab[] {
  return [
    { href: `/user/${name}`, label: "Overview" },
    { href: `/user/${name}/listens`, label: "Listens" },
    { href: `/user/${name}/stats`, label: "Stats" },
    { href: `/user/${name}/playlists`, label: "Playlists" },
    { href: `/user/${name}/pins`, label: "Pins" },
    { href: `/user/${name}/taste`, label: "Loves" },
    // Community covers Followers + Following sub-tabs.
    {
      href: `/user/${name}/community`,
      label: "Community",
      exact: false,
    },
  ];
}

export async function UserPageHeader({ name }: { name: string }) {
  const session = await auth();
  const viewer = session?.user?.mbUsername;
  const isOwnProfile =
    !!viewer && viewer.toLowerCase() === name.toLowerCase();

  // Fetch initial playing-now in parallel with the rest so the header
  // renders without a flash; LiveOnAirIndicator polls from there.
  const initialPlayingPromise = getPlayingNow(name).catch(() => null);

  let followInitial = false;
  let disabledReason: string | undefined;
  if (viewer && !isOwnProfile) {
    const token = await getLbTokenForRequest();
    if (!token) {
      disabledReason =
        "Add your ListenBrainz token in Settings to follow users.";
    }
    try {
      const following = await getFollowing(viewer);
      followInitial = following.some(
        (u) => u.toLowerCase() === name.toLowerCase(),
      );
    } catch {
      // Ignore — toggle defaults to "Follow" and the user's first
      // click will surface a real LB error if anything's actually broken.
    }
  }

  const initialPlaying = await initialPlayingPromise;

  // Bluesky avatar override — when the profile owner has linked a
  // Bluesky account and the viewer's flag is on, render their
  // Bluesky avatar in place of the DiceBear default. Falls back
  // silently when any precondition fails. The same fetch is reused
  // by <BlueskyStrip> below via unstable_cache.
  const bskyDisplay = await getBskyDisplayProfile(name, viewer ?? null);
  const avatarOverride = bskyDisplay?.avatar ?? undefined;

  return (
    <header className="border-border/60 border-b">
      <div className="mx-auto max-w-7xl px-4 pt-10 pb-0 sm:px-6">
        <div className="relative flex flex-col items-start gap-4 pb-6 sm:flex-row sm:items-start sm:gap-6">
          {/* Avatar offset down on sm+ so its centre aligns with the
              username row rather than the "LISTENBRAINZ USER" eyebrow
              above it. The offset roughly matches the eyebrow's
              line-height + gap. */}
          <UserAvatar
            username={name}
            imageUrl={avatarOverride}
            className="size-16 sm:mt-5 sm:size-20"
            fallbackClassName="text-xl"
          />
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground text-xs tracking-wide uppercase">
              ListenBrainz user
            </p>
            {/* Username + radio-station icon ride together — radio
                acts as a small affordance hanging off the name, so
                the Follow button can right-justify on the same row
                instead of shoving the radio widget out to the edge. */}
            <div className="flex items-center gap-2">
              <h1 className="truncate text-3xl font-semibold tracking-tight sm:text-4xl">
                {name}
              </h1>
              <UserStatsRadioWidget username={name} />
            </div>
            {/* On-air widget sits directly under the username so a
                currently-playing track reads as part of the user's
                identity (right next to the radio-station icon).
                Bluesky bio drops below it. */}
            <LiveOnAirIndicator
              username={name}
              initialListen={initialPlaying}
              hideListenAlong={isOwnProfile}
              size="default"
              className="mt-2"
            />
            {/* Optional Bluesky-identity row — Bluesky favicon (handle
                in tooltip) followed by the linked account's bio
                rendered inline. Renders null when the viewer's flag
                is off, when the profile owner hasn't linked, or when
                Bluesky is unreachable. Suspended so a slow AppView
                call doesn't block the header. */}
            <Suspense fallback={null}>
              <BlueskyStrip name={name} />
            </Suspense>
          </div>
          {viewer && !isOwnProfile && (
            // Mobile: pin to the top-right corner of the header so
            // the affordance is reachable without scrolling past the
            // username + bsky bio + on-air rows. Desktop (sm+):
            // revert to the natural in-flow position — the flex row
            // already puts the button on the right edge.
            <div className="absolute top-0 right-0 sm:static">
              <FollowToggle
                target={name}
                initiallyFollowing={followInitial}
                disabledReason={disabledReason}
              />
            </div>
          )}
        </div>
        <SectionTabs tabs={userTabs(name)} />
      </div>
    </header>
  );
}
