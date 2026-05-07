import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getArtistsByTag,
  getReleaseGroupsByTag,
} from "@/lib/clients/musicbrainz";
import {
  getArtistPopularityBatch,
  getLbRadio,
  getReleaseGroupPopularityBatch,
  type LbRadioTrack,
} from "@/lib/clients/listenbrainz";
import { caaReleaseGroupUrl } from "@/lib/clients/coverart";
import { ArtistAvatar } from "@/components/achordion/artist-avatar";
import { CoverArt } from "@/components/achordion/cover-art";
import { PageShell } from "@/components/achordion/page-shell";
import { LbRadioSection } from "@/components/achordion/lb-radio-section";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Recency-decay scoring. Half-life of 10 years means an album from 10
 * years ago is worth half as much per-listen as a release from this
 * year, an album from 20 years ago is worth a quarter, etc. Tuned so
 * "what's popular AND not from the boomer era" surfaces — without it,
 * tag pages for post-1990 movements like indie rock kept showing
 * decades-old MB-tag-noise (e.g. The Beatles tagged as "indie rock").
 *
 * `currentYear` is computed once at module load — fine for our use
 * since the page is edge-cached for 1h and the year only ticks once
 * a year. We don't need January-1st-precision freshness here.
 */
const RECENCY_HALFLIFE_YEARS = 10;
const CURRENT_YEAR = new Date().getUTCFullYear();

function recencyDecay(year: number | null | undefined): number {
  if (!year || !Number.isFinite(year)) return 0.05; // unknown date → mostly suppressed
  const age = Math.max(0, CURRENT_YEAR - year);
  return Math.pow(0.5, age / RECENCY_HALFLIFE_YEARS);
}

function parseYear(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = value.match(/^(\d{4})/);
  if (!m) return null;
  const y = Number.parseInt(m[1], 10);
  return Number.isFinite(y) ? y : null;
}

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
  // Pull a WIDE candidate pool from MB (100 instead of 24). MB's
  // tag-vote ordering surfaces editor-curated obscurities by default
  // — we want the broader set so we can re-rank by real listen
  // activity and slice the head. After re-rank, only the top 24
  // render.
  const [artistsAll, radio] = await Promise.all([
    getArtistsByTag(tag, 100),
    getLbRadio(`tag:(${tag})`, "easy").catch(() => null),
  ]);
  if (artistsAll.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No artists for this tag.</p>
    );
  }
  // Batch one LB call to get total_listen_count for every candidate
  // (single POST, not 100 GETs). Missing entries imply zero listens.
  const popularity = await getArtistPopularityBatch(
    artistsAll.map((a) => a.id),
  ).catch(() => new Map<string, number>());
  // Sort: primary = LB total_listen_count desc (the user's "I'd
  // expect more popular artists" signal); secondary = LB Radio rank
  // (recency tiebreak — currently-trending artists bubble up within
  // their popularity bracket); tertiary = MB's natural order.
  const ranks = buildPopularityRanks(radio);
  // Score = listen_count * recency_decay(career-start year). Surfaces
  // popular artists who started recently enough to plausibly fit the
  // tag — deflates The Beatles in a hypothetical "indie rock" tag
  // search (career start 1957 → ~0.009× multiplier even with 50M
  // listens). Tie-break on LB Radio rank so two equally-decayed
  // popular artists fall in radio order.
  const sorted = artistsAll.slice().sort((a, b) => {
    const aBegin = parseYear(a["life-span"]?.begin);
    const bBegin = parseYear(b["life-span"]?.begin);
    const sa = (popularity.get(a.id) ?? 0) * recencyDecay(aBegin);
    const sb = (popularity.get(b.id) ?? 0) * recencyDecay(bBegin);
    if (sa !== sb) return sb - sa;
    const ra = ranks?.artists.get(a.id) ?? Infinity;
    const rb = ranks?.artists.get(b.id) ?? Infinity;
    return ra - rb;
  });
  const artists = sorted.slice(0, 24);
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {artists.map((a) => (
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
  // Same widen-and-rerank pattern as ArtistsForTag: pull 100 MB
  // candidates, batch-query LB for release-group listen counts, sort
  // by all-time popularity (so the household-name records actually
  // appear), tie-break by the artist's LB Radio rank for the recency
  // signal. LB Radio reports release (not release-group) MBIDs so we
  // fall back to artist-rank for the recency tiebreak — close enough
  // to "what's hot in this genre" without a per-release-group join.
  const [groupsAll, radio] = await Promise.all([
    getReleaseGroupsByTag(tag, 100),
    getLbRadio(`tag:(${tag})`, "easy").catch(() => null),
  ]);
  if (groupsAll.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No albums for this tag.</p>
    );
  }
  const popularity = await getReleaseGroupPopularityBatch(
    groupsAll.map((g) => g.id),
  ).catch(() => new Map<string, number>());
  const ranks = buildPopularityRanks(radio);
  // Score = listen_count * recency_decay(first-release year). Same
  // halflife as artists so an album by an old band that happens to
  // be wrongly tagged for the genre falls way below recent records
  // in the same listen-count tier. Tie-break on the artist's LB
  // Radio position for the recency signal.
  const sortedAll = groupsAll.slice().sort((a, b) => {
    const ay = parseYear(a["first-release-date"]);
    const by = parseYear(b["first-release-date"]);
    const sa = (popularity.get(a.id) ?? 0) * recencyDecay(ay);
    const sb = (popularity.get(b.id) ?? 0) * recencyDecay(by);
    if (sa !== sb) return sb - sa;
    const aArtist = a["artist-credit"]?.[0]?.artist?.id ?? "";
    const bArtist = b["artist-credit"]?.[0]?.artist?.id ?? "";
    const ra = ranks?.artists.get(aArtist) ?? Infinity;
    const rb = ranks?.artists.get(bArtist) ?? Infinity;
    return ra - rb;
  });
  const sorted = sortedAll.slice(0, 24);
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
