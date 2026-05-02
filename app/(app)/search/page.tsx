import Link from "next/link";
import { Suspense } from "react";
import { searchUsers } from "@/lib/clients/listenbrainz";
import { searchArtists, searchReleaseGroups } from "@/lib/clients/musicbrainz";
import { caaReleaseGroupUrl } from "@/lib/clients/coverart";
import { CoverArt } from "@/components/achordion/cover-art";
import { PageShell } from "@/components/achordion/page-shell";
import { PageHeader } from "@/components/achordion/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Search" };

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

async function UserResults({ q }: { q: string }) {
  const users = await searchUsers(q, 8);
  if (users.length === 0) return <Empty kind="users" />;
  return (
    <ul className="space-y-1">
      {users.map((name) => (
        <li key={name}>
          <Link
            href={`/user/${encodeURIComponent(name)}`}
            className="hover:bg-muted/50 flex items-center gap-3 rounded-md px-2 py-2 text-sm"
          >
            <span className="bg-muted flex size-8 items-center justify-center rounded-full text-xs font-medium">
              {name.slice(0, 1).toUpperCase()}
            </span>
            {name}
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function ArtistResults({ q }: { q: string }) {
  const artists = await searchArtists(q, 8);
  if (artists.length === 0) return <Empty kind="artists" />;
  return (
    <ul className="space-y-1">
      {artists.map((a) => (
        <li key={a.id}>
          <Link
            href={`/artist/${a.id}`}
            className="hover:bg-muted/50 block rounded-md px-2 py-2"
          >
            <p className="text-sm font-medium">{a.name}</p>
            {a.disambiguation && (
              <p className="text-muted-foreground text-xs">{a.disambiguation}</p>
            )}
            <p className="text-muted-foreground/70 text-xs">
              {[a.type, a.country].filter(Boolean).join(" · ")}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function AlbumResults({ q }: { q: string }) {
  const groups = await searchReleaseGroups(q, 8);
  if (groups.length === 0) return <Empty kind="albums" />;
  return (
    <ul className="space-y-2">
      {groups.map((rg) => {
        const artistName = rg["artist-credit"]?.[0]?.name ?? "";
        return (
          <li key={rg.id}>
            <Link
              href={`/release-group/${rg.id}`}
              className="hover:bg-muted/50 flex items-center gap-3 rounded-md p-2"
            >
              <CoverArt
                src={caaReleaseGroupUrl(rg.id, 250)}
                alt={rg.title}
                size={48}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{rg.title}</p>
                <p className="text-muted-foreground truncate text-xs">
                  {artistName} ·{" "}
                  {rg["primary-type"] ?? "Release group"}
                  {rg["first-release-date"] &&
                    ` · ${rg["first-release-date"].slice(0, 4)}`}
                </p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Empty({ kind }: { kind: string }) {
  return (
    <p className="text-muted-foreground text-sm">No {kind} found.</p>
  );
}

function ColumnSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full rounded-md" />
      ))}
    </div>
  );
}

export default async function SearchPage({ searchParams }: PageProps) {
  const { q = "" } = await searchParams;
  const trimmed = q.trim();

  return (
    <PageShell>
      <PageHeader
        eyebrow="Search"
        title={trimmed ? `“${trimmed}”` : "Search Achordion"}
        description="Users, artists, and albums in one query."
      />

      <form
        action="/search"
        method="get"
        className="mb-10 flex max-w-xl items-center gap-2"
      >
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search users, artists, albums…"
          className="border-border/60 bg-background placeholder:text-muted-foreground/70 focus:ring-ring/30 h-10 flex-1 rounded-lg border px-3 text-sm outline-none focus:ring-2"
          autoFocus
        />
        <button
          type="submit"
          className="bg-primary text-primary-foreground h-10 rounded-lg px-4 text-sm font-medium"
        >
          Search
        </button>
      </form>

      {!trimmed ? (
        <p className="text-muted-foreground text-sm">
          Type a query and hit Enter.
        </p>
      ) : (
        <div className="grid gap-10 md:grid-cols-3">
          <section>
            <h2 className="mb-3 text-xs tracking-wide uppercase">Users</h2>
            <Suspense fallback={<ColumnSkeleton />}>
              <UserResults q={trimmed} />
            </Suspense>
          </section>
          <section>
            <h2 className="mb-3 text-xs tracking-wide uppercase">Artists</h2>
            <Suspense fallback={<ColumnSkeleton />}>
              <ArtistResults q={trimmed} />
            </Suspense>
          </section>
          <section>
            <h2 className="mb-3 text-xs tracking-wide uppercase">Albums</h2>
            <Suspense fallback={<ColumnSkeleton />}>
              <AlbumResults q={trimmed} />
            </Suspense>
          </section>
        </div>
      )}
    </PageShell>
  );
}
