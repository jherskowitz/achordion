import { Suspense } from "react";
import Link from "next/link";
import { auth } from "@/auth";
import {
  getCreatedForPlaylists,
  getPlaylist,
  playlistMbidFromIdentifier,
  type LbPlaylistSummary,
  type LbRadioTrack,
} from "@/lib/clients/listenbrainz";
import { PageShell } from "@/components/achordion/page-shell";
import { PlaylistCard } from "@/components/achordion/playlist-card";
import { EmptyState } from "@/components/achordion/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Weekly Explorations" };

const JSPF_PLAYLIST_KEY = "https://musicbrainz.org/doc/jspf#playlist";

function dateOf(p: LbPlaylistSummary): number {
  const ext = p.playlist.extension?.[JSPF_PLAYLIST_KEY];
  const iso = ext?.last_modified_at ?? p.playlist.date;
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

async function CardWithCovers({ entry }: { entry: LbPlaylistSummary }) {
  const mbid = playlistMbidFromIdentifier(entry.playlist.identifier);
  let tracks: LbRadioTrack[] = [];
  if (mbid) {
    const detail = await getPlaylist(mbid).catch(() => null);
    if (detail) tracks = detail.tracks;
  }
  return <PlaylistCard entry={entry} tracks={tracks} />;
}

function CardSkeleton() {
  return (
    <div className="border-border/60 flex gap-3 rounded-xl border px-4 py-3">
      <Skeleton className="size-16 shrink-0 rounded-md" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

async function Body({ username }: { username: string }) {
  const page = await getCreatedForPlaylists(username, 100).catch(() => null);
  if (!page) {
    return (
      <EmptyState
        title="Couldn't load playlists"
        description="ListenBrainz didn't respond. Try again in a moment."
      />
    );
  }
  const matches = page.playlists
    .filter(
      (p) =>
        p.playlist.extension?.[JSPF_PLAYLIST_KEY]?.additional_metadata
          ?.algorithm_metadata?.source_patch === "weekly-exploration",
    )
    .sort((a, b) => dateOf(b) - dateOf(a));

  if (matches.length === 0) {
    return (
      <EmptyState
        title="No explorations yet"
        description="Weekly Explorations push you toward stuff outside your usual orbit. Your first one shows up after a couple weeks of listening."
      />
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {matches.map((entry) => (
        <li key={entry.playlist.identifier}>
          <Suspense fallback={<CardSkeleton />}>
            <CardWithCovers entry={entry} />
          </Suspense>
        </li>
      ))}
    </ul>
  );
}

export default async function WeeklyExplorationPage() {
  const session = await auth();
  const username = session?.user?.mbUsername ?? null;
  if (!username) {
    return (
      <PageShell className="pt-8">
        <EmptyState
          title="Sign in for Weekly Explorations"
          description="A fresh exploration playlist arrives every week — adjacent to your taste but not too close."
          hint={
            <Button size="sm" nativeButton={false} render={<Link href="/login" />}>
              Continue with MusicBrainz
            </Button>
          }
        />
      </PageShell>
    );
  }
  return (
    <PageShell className="pt-8">
      <Suspense
        fallback={
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i}>
                <CardSkeleton />
              </li>
            ))}
          </ul>
        }
      >
        <Body username={username} />
      </Suspense>
    </PageShell>
  );
}
