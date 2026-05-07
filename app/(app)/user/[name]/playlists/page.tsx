import { Suspense } from "react";
import {
  getPlaylist,
  getUserPlaylists,
  playlistMbidFromIdentifier,
  type LbPlaylistSummary,
  type LbRadioTrack,
} from "@/lib/clients/listenbrainz";
import { auth } from "@/auth";
import { getLbTokenForRequest } from "@/lib/lb-token";
import { PageShell } from "@/components/achordion/page-shell";
import { PlaylistCard } from "@/components/achordion/playlist-card";
import { EmptyState } from "@/components/achordion/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

interface PageParams {
  params: Promise<{ name: string }>;
}

async function CardWithCovers({
  entry,
  hideCreatorIfMatches,
  token,
}: {
  entry: LbPlaylistSummary;
  hideCreatorIfMatches?: string;
  /** Forwarded so private-playlist track previews resolve when the
   *  viewer is the owner — LB 404s the playlist endpoint without auth
   *  for private items. */
  token?: string;
}) {
  const mbid = playlistMbidFromIdentifier(entry.playlist.identifier);
  let tracks: LbRadioTrack[] = [];
  if (mbid) {
    const detail = await getPlaylist(mbid, token).catch(() => null);
    if (detail) tracks = detail.tracks;
  }
  return (
    <PlaylistCard
      entry={entry}
      hideCreatorIfMatches={hideCreatorIfMatches}
      tracks={tracks}
    />
  );
}

function CardSkeleton() {
  return (
    <div className="border-border/60 flex gap-3 rounded-xl border px-4 py-3">
      <Skeleton className="size-16 shrink-0 rounded-md" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-full" />
      </div>
    </div>
  );
}

async function PlaylistsList({ name }: { name: string }) {
  // Owner-of-this-page check: pass the viewer's LB token only when
  // they're looking at their own playlists. LB returns the user's
  // private playlists alongside public ones when authed; without a
  // token (or for any other viewer) the response is public-only.
  const session = await auth();
  const viewer = session?.user?.mbUsername;
  const isSelf =
    !!viewer && viewer.toLowerCase() === name.toLowerCase();
  const token = isSelf ? await getLbTokenForRequest() : null;

  let page;
  try {
    page = await getUserPlaylists(name, 50, 0, token ?? undefined);
  } catch (err) {
    return (
      <EmptyState
        title="Couldn't load playlists"
        description={err instanceof Error ? err.message : ""}
      />
    );
  }

  if (page.playlists.length === 0) {
    return (
      <EmptyState
        title="No playlists yet"
        description={`${name} hasn't created any playlists.`}
      />
    );
  }

  return (
    <>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {page.playlists.map((entry) => (
          <li key={entry.playlist.identifier}>
            <Suspense fallback={<CardSkeleton />}>
              <CardWithCovers
                entry={entry}
                hideCreatorIfMatches={name}
                token={token ?? undefined}
              />
            </Suspense>
          </li>
        ))}
      </ul>
      {page.total > page.playlists.length && (
        <p className="text-muted-foreground/70 mt-6 text-xs">
          Showing {page.playlists.length} of {page.total.toLocaleString()}.
        </p>
      )}
    </>
  );
}

function ListShellFallback() {
  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <li key={i}>
          <CardSkeleton />
        </li>
      ))}
    </ul>
  );
}

export default async function PlaylistsPage({ params }: PageParams) {
  const { name } = await params;
  return (
    <PageShell className="pt-8">
      <h2 className="mb-6 text-sm font-semibold tracking-wide uppercase">
        Playlists
      </h2>
      <Suspense fallback={<ListShellFallback />}>
        <PlaylistsList name={name} />
      </Suspense>
    </PageShell>
  );
}
