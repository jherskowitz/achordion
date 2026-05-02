import { Suspense } from "react";
import { getUserPlaylists } from "@/lib/clients/listenbrainz";
import { PageShell } from "@/components/achordion/page-shell";
import { PlaylistCard } from "@/components/achordion/playlist-card";
import { ComingSoon } from "@/components/achordion/coming-soon";
import { Skeleton } from "@/components/ui/skeleton";

interface PageParams {
  params: Promise<{ name: string }>;
}

async function PlaylistsList({ name }: { name: string }) {
  let page;
  try {
    page = await getUserPlaylists(name, 50);
  } catch (err) {
    return (
      <ComingSoon
        title="Couldn't load playlists"
        description={err instanceof Error ? err.message : ""}
      />
    );
  }

  if (page.playlists.length === 0) {
    return (
      <ComingSoon
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
            <PlaylistCard entry={entry} hideCreatorIfMatches={name} />
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

function Fallback() {
  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <li
          key={i}
          className="border-border/60 space-y-2 rounded-xl border px-4 py-3"
        >
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-full" />
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
      <Suspense fallback={<Fallback />}>
        <PlaylistsList name={name} />
      </Suspense>
    </PageShell>
  );
}
