import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getArtistsByTag,
  getReleaseGroupsByTag,
} from "@/lib/clients/musicbrainz";
import { getLbRadio } from "@/lib/clients/listenbrainz";
import { caaReleaseGroupUrl } from "@/lib/clients/coverart";
import { CoverArt } from "@/components/achordion/cover-art";
import { PageShell } from "@/components/achordion/page-shell";
import { LbRadioSection } from "@/components/achordion/lb-radio-section";
import { Skeleton } from "@/components/ui/skeleton";

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
  const artists = await getArtistsByTag(tag, 24);
  if (artists.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No artists for this tag.</p>
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {artists.map((a) => (
        <li key={a.id}>
          <Link
            href={`/artist/${a.id}`}
            className="border-border/60 hover:border-foreground/30 hover:bg-muted/30 group block min-w-0 rounded-xl border p-4 transition-colors"
          >
            <p className="truncate text-sm font-medium">{a.name}</p>
            {a.disambiguation ? (
              <p className="text-muted-foreground/80 mt-1 line-clamp-2 text-xs leading-5">
                {a.disambiguation}
              </p>
            ) : (
              (a.type || a.country) && (
                <p className="text-muted-foreground/70 mt-1 text-xs">
                  {[a.type, a.country].filter(Boolean).join(" · ")}
                </p>
              )
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function AlbumsForTag({ tag }: { tag: string }) {
  const groups = await getReleaseGroupsByTag(tag, 24);
  if (groups.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No albums for this tag.</p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {groups.map((rg) => {
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

      <div className="grid gap-10 lg:grid-cols-[1fr_240px]">
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
