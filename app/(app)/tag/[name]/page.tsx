import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getArtistsByTag,
  getReleaseGroupsByTag,
} from "@/lib/clients/musicbrainz";
import { getLbRadio, type LbRadioTrack } from "@/lib/clients/listenbrainz";
import { caaReleaseGroupUrl } from "@/lib/clients/coverart";
import { ArtistAvatar } from "@/components/achordion/artist-avatar";
import { CoverArt } from "@/components/achordion/cover-art";
import { PageShell } from "@/components/achordion/page-shell";
import { LbRadioSection } from "@/components/achordion/lb-radio-section";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Build "what's hot recently for this genre" MBID rank maps from the
 * tag's LB Radio output. LB Radio's algorithm leans on currently-
 * trending listening data, so the order tracks appear in the playlist
 * is a free recency-weighted popularity signal — no extra API calls
 * needed. We dedupe by MBID and keep the FIRST occurrence position so
 * the most-prominent track for each artist/album anchors its rank.
 *
 * Returns null on bad input so callers can fall back to MB's tag-vote
 * ordering (the order `getArtistsByTag` / `getReleaseGroupsByTag`
 * return naturally).
 */
function buildPopularityRanks(
  tracks: LbRadioTrack[] | null,
): { artists: Map<string, number>; releases: Map<string, number> } | null {
  if (!tracks || tracks.length === 0) return null;
  const artists = new Map<string, number>();
  const releases = new Map<string, number>();
  tracks.forEach((t, i) => {
    if (t.artistMbid && !artists.has(t.artistMbid)) artists.set(t.artistMbid, i);
    if (t.releaseMbid && !releases.has(t.releaseMbid)) releases.set(t.releaseMbid, i);
  });
  return { artists, releases };
}

/** Stable comparator that pulls items present in `rank` to the top
 *  in rank order, then leaves the rest in their original order. */
function rankedSort<T>(items: T[], idOf: (t: T) => string, rank: Map<string, number>): T[] {
  const sorted = items.slice();
  sorted.sort((a, b) => {
    const ra = rank.get(idOf(a));
    const rb = rank.get(idOf(b));
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return 0;
  });
  return sorted;
}

interface PageParams {
  params: Promise<{ name: string }>;
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

async function ArtistsForTag({ tag }: { tag: string }) {
  // Fetch MB tag-list + LB Radio in parallel. Both are cached, both
  // are needed: MB for the canonical artist set, LB Radio for the
  // recency-weighted popularity ordering.
  const [artists, radio] = await Promise.all([
    getArtistsByTag(tag, 24),
    getLbRadio(`tag:(${tag})`, "easy").catch(() => null),
  ]);
  if (artists.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No artists for this tag.</p>
    );
  }
  const ranks = buildPopularityRanks(radio);
  const sorted = ranks
    ? rankedSort(artists, (a) => a.id, ranks.artists)
    : artists;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {sorted.map((a) => (
        <li key={a.id}>
          <Link
            href={`/artist/${a.id}`}
            className="border-border/60 hover:border-foreground/30 hover:bg-muted/30 group flex min-w-0 items-center gap-3 rounded-xl border p-4 transition-colors"
          >
            <Suspense
              fallback={<Skeleton className="size-10 shrink-0 rounded-full" />}
            >
              <ArtistAvatar
                mbid={a.id}
                name={a.name}
                className="size-10 shrink-0"
                fallbackClassName="text-xs"
                width={128}
              />
            </Suspense>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{a.name}</p>
              {a.disambiguation ? (
                <p className="text-muted-foreground/80 mt-1 line-clamp-2 text-xs leading-5">
                  {a.disambiguation}
                </p>
              ) : (
                (a.type || a.country) && (
                  <p className="text-muted-foreground/70 mt-1 truncate text-xs">
                    {[a.type, a.country].filter(Boolean).join(" · ")}
                  </p>
                )
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function AlbumsForTag({ tag }: { tag: string }) {
  // LB Radio reports release MBIDs (single printings) but MB returns
  // release-GROUP MBIDs (the abstract album), which means a direct
  // rank lookup mostly misses. Falling back to the ARTIST popularity
  // rank from the radio gets us "albums by recently-hot artists for
  // this tag float to the top" — close enough to the user's "what's
  // hot recently" intent without a per-release-group lookup chain.
  const [groups, radio] = await Promise.all([
    getReleaseGroupsByTag(tag, 24),
    getLbRadio(`tag:(${tag})`, "easy").catch(() => null),
  ]);
  if (groups.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No albums for this tag.</p>
    );
  }
  const ranks = buildPopularityRanks(radio);
  const sorted = ranks
    ? rankedSort(
        groups,
        (rg) => rg["artist-credit"]?.[0]?.artist?.id ?? "",
        ranks.artists,
      )
    : groups;
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {sorted.map((rg) => {
        const artistName = rg["artist-credit"]?.[0]?.name ?? "";
        const year = rg["first-release-date"]?.slice(0, 4);
        return (
          <Link
            key={rg.id}
            href={`/release-group/${rg.id}`}
            className="group min-w-0"
          >
            <CoverArt
              src={caaReleaseGroupUrl(rg.id, 250)}
              alt={rg.title}
              size={240}
              className="aspect-square h-auto w-full transition-opacity group-hover:opacity-90"
              rounded="md"
            />
            <p className="mt-2 truncate text-sm font-medium">{rg.title}</p>
            <p className="text-muted-foreground truncate text-xs">
              {artistName}
              {year && ` · ${year}`}
            </p>
          </Link>
        );
      })}
    </div>
  );
}

async function TagRadioBlock({ tag }: { tag: string }) {
  const tracks = await getLbRadio(`tag:(${tag})`, "easy");
  return <LbRadioSection seedLabel={`#${tag}`} tracks={tracks} />;
}

function ArtistGridSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="border-border/60 space-y-2 rounded-xl border p-4"
        >
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-full" />
        </div>
      ))}
    </div>
  );
}

function AlbumGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="aspect-square w-full rounded-md" />
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export async function generateMetadata({ params }: PageParams) {
  const { name } = await params;
  const tag = decodeURIComponent(name).toLowerCase();
  return { title: `#${tag}` };
}

export default async function TagPage({ params }: PageParams) {
  const { name } = await params;
  const tag = decodeURIComponent(name).toLowerCase().trim();
  if (!tag) notFound();

  return (
    <PageShell>
      <header className="pt-10 pb-8">
        <p className="text-muted-foreground mb-2 text-xs tracking-wide uppercase">
          Tag
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          #{titleCase(tag)}
        </h1>
        <p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-6">
          Top artists, popular albums, and a curated radio station for the{" "}
          <span className="text-foreground">{tag}</span> tag.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-w-0 space-y-12">
          <Suspense fallback={<Skeleton className="h-24 w-full rounded-2xl" />}>
            <TagRadioBlock tag={tag} />
          </Suspense>

          <section>
            <h2 className="mb-4 text-sm font-semibold tracking-wide uppercase">
              Top artists
            </h2>
            <Suspense fallback={<ArtistGridSkeleton />}>
              <ArtistsForTag tag={tag} />
            </Suspense>
          </section>

          <section>
            <h2 className="mb-4 text-sm font-semibold tracking-wide uppercase">
              Albums
            </h2>
            <Suspense fallback={<AlbumGridSkeleton />}>
              <AlbumsForTag tag={tag} />
            </Suspense>
          </section>
        </div>
      </div>
    </PageShell>
  );
}
