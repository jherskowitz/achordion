import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { auth } from "@/auth";
import { getFollowing, getPlayingNow } from "@/lib/clients/listenbrainz";
import { getLbTokenForRequest } from "@/lib/lb-token";
import { FollowToggle } from "./follow-toggle";
import { LiveOnAirIndicator } from "./live-on-air-indicator";
import { SectionTabs, type SectionTab } from "./section-tabs";

function userTabs(name: string): SectionTab[] {
  return [
    { href: `/user/${name}`, label: "Overview" },
    { href: `/user/${name}/listens`, label: "Listens" },
    { href: `/user/${name}/stats`, label: "Stats" },
    { href: `/user/${name}/playlists`, label: "Playlists" },
    { href: `/user/${name}/pins`, label: "Pins" },
    { href: `/user/${name}/taste`, label: "Taste" },
    { href: `/user/${name}/recommendations`, label: "Recommendations" },
    { href: `/user/${name}/feed`, label: "Feed" },
    { href: `/user/${name}/followers`, label: "Followers" },
    { href: `/user/${name}/following`, label: "Following" },
  ];
}

export async function UserPageHeader({ name }: { name: string }) {
  const initial = name.slice(0, 1).toUpperCase();
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

  return (
    <header className="border-border/60 border-b">
      <div className="mx-auto max-w-7xl px-4 pt-10 pb-0 sm:px-6">
        <div className="flex items-center gap-4 pb-6 sm:gap-6">
          <Avatar className="size-16 sm:size-20">
            <AvatarFallback className="text-xl">{initial}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground text-xs tracking-wide uppercase">
              ListenBrainz user
            </p>
            <h1 className="truncate text-3xl font-semibold tracking-tight sm:text-4xl">
              {name}
            </h1>
            <LiveOnAirIndicator
              username={name}
              initialListen={initialPlaying}
              hideListenAlong={isOwnProfile}
              size="default"
              className="mt-2"
            />
          </div>
          {viewer && !isOwnProfile && (
            <FollowToggle
              target={name}
              initiallyFollowing={followInitial}
              disabledReason={disabledReason}
            />
          )}
        </div>
        <SectionTabs tabs={userTabs(name)} />
      </div>
    </header>
  );
}
