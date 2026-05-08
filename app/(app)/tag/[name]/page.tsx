import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getArtistsByTag } from "@/lib/clients/musicbrainz";
import {
  getArtistPopularityBatch,
  getLbRadio,
  getRecordingMetadata,
  getSitewideTopReleaseGroups,
  type LbRadioTrack,
} from "@/lib/clients/listenbrainz";
import { caaReleaseGroupUrl } from "@/lib/clients/coverart";
import { ArtistAvatar } from "@/components/achordion/artist-avatar";
import { CoverArt } from "@/components/achordion/cover-art";
import { PageShell } from "@/components/achordion/page-shell";
import { LbRadioSection } from "@/components/achordion/lb-radio-section";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Recency-decay scoring — used as a TIEBREAKER below the LB Radio
 * primary sort. Tag pages are tuned for "hot right now" rather than
 * "all-time canonical": the LB Radio for the tag is the strongest
 * "currently being listened to" signal, so it leads. Recency decay
 * + listen count breaks ties among items not in the radio (or among
 * items at the same radio position).
 *
 * - Albums: 3y halflife. A 2024 album is worth ~10× a 2014 album of
 *   the same listen count, ~80× a 2004 album. Aggressive on purpose
 *   — we don't want canonical 2005-era records hogging the slots
 *   when newer-and-popular alternatives exist.
 *
 * - Artists: 5y halflife. `life-span.begin` is the band's formation
 *   year, which is fuzzier than an album's release date — gentler
 *   curve gives currently-active old(er) bands a chance.
 */
const ARTIST_HALFLIFE_YEARS = 5;
const ALBUM_HALFLIFE_YEARS = 3;
const CURRENT_YEAR = new Date().getUTCFullYear();

function recencyDecay(
  year: number | null | undefined,
  halflifeYears: number,
): number {
  if (!year || !Number.isFinite(year)) return 0.05; // unknown date → mostly suppressed
  const age = Math.max(0, CURRENT_YEAR - year);
  return Math.pow(0.5, age / halflifeYears);
}

/**
 * Minimum listen count for inclusion in the ranked pool. Items below
 * this threshold are dropped before sorting — typical case is the
 * long tail of niche records MB editors tagged but no one actually
 * listens to. Keeping them lets recency decay tie-break a sea of
 * zeros, which is how mid-90s no-name records were leaking into the
 * top-24 even after the recency fix.
 */
const MIN_LISTENS = 1000;

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
  // Drop pool entries with no LB activity at all — those are MB-tag
  // editor noise that has no current listenership to justify
  // surfacing.
  const candidatePool = artistsAll.filter(
    (a) => (popularity.get(a.id) ?? 0) >= MIN_LISTENS,
  );
  // Sort key, in order of importance:
  //   1. LB Radio rank — items currently being played for this tag
  //      come first, in radio order. The "hot" signal.
  //   2. listen_count * recency_decay(life-span.begin) — for items
  //      tied or both absent from the radio, prefer popular and
  //      recent. Deflates The Beatles tagged as "indie rock"
  //      (career start 1957 → effectively zero) below currently-
  //      active bands.
  const sorted = candidatePool.slice().sort((a, b) => {
    const ra = ranks?.artists.get(a.id) ?? Infinity;
    const rb = ranks?.artists.get(b.id) ?? Infinity;
    if (ra !== rb) return ra - rb;
    const aBegin = parseYear(a["life-span"]?.begin);
    const bBegin = parseYear(b["life-span"]?.begin);
    const sa =
      (popularity.get(a.id) ?? 0) * recencyDecay(aBegin, ARTIST_HALFLIFE_YEARS);
    const sb =
      (popularity.get(b.id) ?? 0) * recencyDecay(bBegin, ARTIST_HALFLIFE_YEARS);
    return sb - sa;
  });
  // Backfill in case the popularity floor knocked us under 24 — fall
  // back to the original pool sorted by raw popularity for the
  // shortfall so the page never looks half-empty.
  const fallback = artistsAll
    .slice()
    .sort((a, b) => (popularity.get(b.id) ?? 0) - (popularity.get(a.id) ?? 0));
  const seen = new Set(sorted.map((a) => a.id));
  for (const a of fallback) {
    if (sorted.length >= 24) break;
    if (!seen.has(a.id)) {
      sorted.push(a);
      seen.add(a.id);
    }
  }
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
  // "Hot albums" pipeline:
  //
  //   1. LB Radio for the tag — gives us the *candidate set*: ~50
  //      tracks people are currently playing in this genre.
  //   2. Resolve each track's recording_mbid → release_group_mbid via
  //      LB recording metadata so we can dedupe at the canonical
  //      album level (see AGENTS.md "Albums always link to release-
  //      group, never release").
  //   3. Score each release-group by its SITEWIDE listen count over
  //      the past 30 days (LB's `range=month` on
  //      `/stats/sitewide/release-groups`). That's the actual
  //      "what's hot lately" signal — listen-counts users have
  //      generated, not radio-algorithm artifacts.
  //   4. Sort by month-listens DESC. Albums not in the global top-
  //      1000 fall back to their radio-track-frequency (more tracks
  //      from an album in the radio = niche-genre stand-in for
  //      sitewide popularity), so niche tags whose albums never
  //      crack the global top still get a meaningful order.
  const [radio, sitewideMonth] = await Promise.all([
    getLbRadio(`tag:(${tag})`, "easy").catch(() => null),
    getSitewideTopReleaseGroups("month", 1000).catch(() => []),
  ]);
  if (!radio || radio.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No hot albums for this tag right now.
      </p>
    );
  }
  // Build a fast lookup of "month listen count" by release-group mbid
  // from the sitewide top. Items absent from this map = not in the
  // global top-1000 over the past month — score 0, falls back below.
  const monthListensByRg = new Map<string, number>();
  for (const r of sitewideMonth) {
    if (r.release_group_mbid) {
      monthListensByRg.set(r.release_group_mbid, r.listen_count);
    }
  }
  const recordingMbids = radio
    .map((t) => t.recordingMbid)
    .filter((m): m is string => !!m);
  const meta = await getRecordingMetadata(recordingMbids).catch(
    () => new Map<string, never>(),
  );
  // Group by release_group_mbid (preferred) — that's what `/release-
  // group/[mbid]` expects and the canonical album entity.
  interface AlbumEntry {
    releaseGroupMbid: string;
    releaseName: string;
    artistName: string;
    artistMbid: string | null;
    caaId: number | string | null;
    caaReleaseMbid: string | null;
    count: number;
    firstSeen: number;
  }
  const map = new Map<string, AlbumEntry>();
  radio.forEach((t, i) => {
    if (!t.recordingMbid) return;
    const m = meta.get(t.recordingMbid);
    const releaseGroupMbid = m?.release?.release_group_mbid;
    if (!releaseGroupMbid) return;
    const existing = map.get(releaseGroupMbid);
    if (existing) {
      existing.count += 1;
      return;
    }
    map.set(releaseGroupMbid, {
      releaseGroupMbid,
      releaseName: m?.release?.name ?? t.releaseName ?? "",
      artistName: t.artistName,
      artistMbid: t.artistMbid,
      // Prefer the metadata's CAA fields (linked to the canonical
      // release for the recording); fall back to whatever the radio
      // track carried directly.
      caaId: m?.release?.caa_id ?? t.caaId ?? null,
      caaReleaseMbid: m?.release?.caa_release_mbid ?? t.caaReleaseMbid ?? null,
      count: 1,
      firstSeen: i,
    });
  });
  // Sort priority:
  //   1. Sitewide month-listen count DESC (the actual "hot in the
  //      past 30 days" signal — comes from the global top-1000).
  //   2. Radio track-count DESC (fallback for niche-genre albums
  //      that never crack the global top — more tracks from the
  //      album in the radio = stronger genre-internal popularity).
  //   3. First-seen position in the radio (final tiebreaker).
  const albums = Array.from(map.values())
    .map((a) => ({
      ...a,
      monthListens: monthListensByRg.get(a.releaseGroupMbid) ?? 0,
    }))
    .sort((a, b) => {
      if (a.monthListens !== b.monthListens) {
        return b.monthListens - a.monthListens;
      }
      if (a.count !== b.count) return b.count - a.count;
      return a.firstSeen - b.firstSeen;
    })
    .slice(0, 24);

  if (albums.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No hot albums for this tag right now.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {albums.map((a) => {
        // Cover-art source: prefer the LB-supplied caa fields (the
        // edition the recording metadata pointed at). Fall back to
        // the release-group's CAA front lookup so we never double-
        // hit a release that doesn't itself have art.
        const coverSrc =
          a.caaReleaseMbid && a.caaId
            ? `https://coverartarchive.org/release/${a.caaReleaseMbid}/${a.caaId}-250.jpg`
            : caaReleaseGroupUrl(a.releaseGroupMbid, 250);
        const href = `/release-group/${a.releaseGroupMbid}`;
        return (
          <Link
            key={a.releaseGroupMbid}
            href={href}
            className="group min-w-0"
          >
            <CoverArt
              src={coverSrc}
              alt={a.releaseName}
              size={240}
              className="aspect-square h-auto w-full transition-opacity group-hover:opacity-90"
              rounded="md"
            />
            <p className="mt-2 truncate text-sm font-medium">{a.releaseName}</p>
            <p className="text-muted-foreground truncate text-xs">
              {a.artistName}
            </p>
          </Link>
        );
      })}
    </div>
  );
}

async function TagRadioBlock({ tag }: { tag: string }) {
  // LB hiccups (429 / 5xx) shouldn't take the tag page down with
  // a generic error — radio is enrichment, the artists/albums
  // sections below carry the page on their own.
  const tracks = await getLbRadio(`tag:(${tag})`, "easy").catch(() => null);
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
          Hot artists, hot albums, and a curated radio station for the{" "}
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
              Hot artists
            </h2>
            <Suspense fallback={<ArtistGridSkeleton />}>
              <ArtistsForTag tag={tag} />
            </Suspense>
          </section>

          <section>
            <h2 className="mb-4 text-sm font-semibold tracking-wide uppercase">
              Hot albums
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
