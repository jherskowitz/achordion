import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ThemeRadio } from "@/components/achordion/theme-radio";
import { UserAvatar } from "@/components/achordion/user-avatar";
import { BlueskyLinkForm } from "@/components/achordion/bluesky-link-form";
import { BlueskyFriendsSection } from "@/components/achordion/bluesky-friends-section";
import { Suspense } from "react";
import { isFeatureEnabled } from "@/lib/flags";
import { getBskyLink } from "@/lib/bsky-link";
import { signOutAction, unlinkBlueskyAction } from "./actions";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://achordion.xyz";

export const metadata = { title: "Profile" };

export default async function SettingsProfilePage() {
  const session = await auth();
  if (!session?.user?.mbUsername) redirect("/login");

  const username = session.user.mbUsername;
  const displayName = session.user.name ?? username;
  const avatarUrl = session.user.image ?? undefined;

  const bskyEnabled = await isFeatureEnabled("bsky-link", username);
  const bskyLink = bskyEnabled ? await getBskyLink(username) : null;
  const expectedBskyBioUrl = `${SITE_URL}/user/${username}`;

  return (
    <div className="space-y-10">
      <header>
        <h2 className="text-lg font-semibold tracking-tight">Profile</h2>
        <p className="text-muted-foreground mt-1 text-sm leading-6">
          Your{" "}
          <a
            href={`https://musicbrainz.org/user/${username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            MusicBrainz account
          </a>{" "}
          is the identity behind Achordion.
        </p>
      </header>

      <section className="space-y-4">
        <div className="flex items-center gap-4">
          <UserAvatar
            username={username}
            imageUrl={avatarUrl}
            className="size-14"
            fallbackClassName="text-lg"
          />
          <div className="min-w-0">
            <p className="truncate text-base font-medium">{displayName}</p>
            <p className="text-muted-foreground text-sm">
              <Link
                href={`/user/${username}`}
                className="hover:text-foreground underline-offset-4 hover:underline"
              >
                @{username}
              </Link>
            </p>
          </div>
        </div>
      </section>

      {bskyEnabled && (
        <section className="space-y-3">
          <header className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">Bluesky</h3>
            <span className="text-muted-foreground/80 text-xs">
              Optional
            </span>
          </header>
          <p className="text-muted-foreground text-sm leading-6">
            Link your Bluesky account so your Achordion profile shows your
            face, display name, and bio — pulled live from Bluesky, never
            stored here. Don&apos;t link one and nothing changes; you stay
            as anonymous as you were yesterday. This is the only
            user-keyed thing Achordion stores about you, and you can
            remove it any time.
          </p>
          {bskyLink ? (
            <div className="border-border/60 bg-card/30 flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 text-sm">
                <p className="font-medium">
                  <Link
                    href={`https://bsky.app/profile/${bskyLink.handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-foreground underline-offset-4 hover:underline"
                  >
                    @{bskyLink.handle}
                  </Link>
                </p>
                <p className="text-muted-foreground text-xs">
                  Verified{" "}
                  {new Date(bskyLink.verified_at).toLocaleDateString(
                    undefined,
                    { month: "short", day: "numeric", year: "numeric" },
                  )}
                </p>
              </div>
              <form action={unlinkBlueskyAction}>
                <button
                  type="submit"
                  className="border-border/60 hover:bg-muted/40 inline-flex h-9 items-center rounded-lg border px-4 text-sm"
                >
                  Unlink
                </button>
              </form>
            </div>
          ) : null}
          {bskyLink && (
            <p className="text-muted-foreground/80 text-xs leading-5">
              You can remove the Achordion link from your Bluesky bio
              now if you&apos;d like — your link here stays active, and
              future bio edits will show up on your profile within a
              few minutes.
            </p>
          )}
          {!bskyLink ? (
            <BlueskyLinkForm expectedUrl={expectedBskyBioUrl} />
          ) : null}
        </section>
      )}

      {bskyEnabled && bskyLink && (
        // Walk the viewer's bsky follow graph to surface anyone
        // they follow there who's also linked to Achordion.
        // Suspended so a slow Bluesky AppView doesn't block the
        // rest of the page; renders null when there are no matches.
        <Suspense fallback={null}>
          <BlueskyFriendsSection viewer={username} />
        </Suspense>
      )}

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Theme</h3>
        <ThemeRadio />
        <p className="text-muted-foreground text-xs leading-5">
          Stored locally in your browser — not synced across devices.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Account</h3>
        <form action={signOutAction}>
          <button
            type="submit"
            className="border-border/60 hover:bg-muted/40 inline-flex h-9 items-center rounded-lg border px-4 text-sm"
          >
            Sign out
          </button>
        </form>
      </section>
    </div>
  );
}
