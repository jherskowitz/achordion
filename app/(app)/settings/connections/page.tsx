import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, ExternalLink } from "lucide-react";
import { auth } from "@/auth";
import { hasUserLbToken } from "@/lib/lb-token";
import {
  getMusicServiceActivity,
  type MusicServiceActivity,
} from "@/lib/clients/listenbrainz";
import { LbTokenForm } from "@/components/achordion/lb-token-form";
import { MusicServicesCard } from "@/components/achordion/music-services-card";
import { clearLbTokenAction } from "../actions";

function relativeTimeFromUnix(unixSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - unixSeconds;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  const date = new Date(unixSeconds * 1000);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: now - unixSeconds > 86400 * 365 ? "numeric" : undefined,
  });
}

function activityToLabels(activity: MusicServiceActivity) {
  return {
    spotify: activity.spotify ? relativeTimeFromUnix(activity.spotify) : null,
    lastfm: activity.lastfm ? relativeTimeFromUnix(activity.lastfm) : null,
    librefm: activity.librefm
      ? relativeTimeFromUnix(activity.librefm)
      : null,
  };
}

export const metadata = { title: "Connections" };

export default async function ConnectionsPage() {
  const session = await auth();
  if (!session?.user?.mbUsername) redirect("/login");

  const tokenConfigured = await hasUserLbToken();
  const activity = await getMusicServiceActivity(session.user.mbUsername);
  const activityLabels = activityToLabels(activity);

  return (
    <div className="space-y-10">
      <header>
        <h2 className="text-lg font-semibold tracking-tight">Connections</h2>
        <p className="text-muted-foreground mt-1 text-sm leading-6">
          Link Achordion to your ListenBrainz and MusicBrainz accounts.
        </p>
      </header>

      <section className="space-y-3">
        <header className="flex items-center justify-between">
          <h3 className="text-sm font-medium">MusicBrainz</h3>
          <span className="text-foreground bg-muted/50 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs">
            <Check className="size-3" />
            Connected
          </span>
        </header>
        <p className="text-muted-foreground text-sm leading-6">
          Signed in as{" "}
          <Link
            href={`https://musicbrainz.org/user/${session.user.mbUsername}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground hover:underline underline-offset-4"
          >
            {session.user.mbUsername}
          </Link>
          . MusicBrainz powers identity, artist metadata, and discography.
        </p>
      </section>

      <section className="space-y-3">
        <header className="flex items-center justify-between">
          <h3 className="text-sm font-medium">ListenBrainz</h3>
          <span
            className={
              tokenConfigured
                ? "text-foreground bg-muted/50 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs"
                : "text-muted-foreground/80 bg-muted/30 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs"
            }
          >
            {tokenConfigured ? (
              <>
                <Check className="size-3" />
                Token saved
              </>
            ) : (
              "No token"
            )}
          </span>
        </header>
        <p className="text-muted-foreground text-sm leading-6">
          A user token unlocks LB Radio embedding, fresh releases filtered to
          your library, and (later) submitting listens or editing pins. Find
          yours on your{" "}
          <a
            href="https://listenbrainz.org/profile/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground hover:underline inline-flex items-center gap-1 underline-offset-4"
          >
            ListenBrainz profile page
            <ExternalLink className="size-3" />
          </a>
          .
        </p>
        <LbTokenForm hasToken={tokenConfigured} />
        {tokenConfigured && (
          <form action={clearLbTokenAction}>
            <button
              type="submit"
              className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
            >
              Remove saved token
            </button>
          </form>
        )}
      </section>

      <MusicServicesCard activity={activityLabels} />

      <section className="space-y-3">
        <header>
          <h3 className="text-sm font-medium">Scrobbler apps</h3>
        </header>
        <p className="text-muted-foreground text-sm leading-6">
          Looking for a music player or browser extension that scrobbles
          straight to ListenBrainz? See the curated list of cross-
          platform clients on the{" "}
          <Link
            href="/apps"
            className="text-foreground hover:underline underline-offset-4"
          >
            App Marketplace
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
