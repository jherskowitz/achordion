import Link from "next/link";
import { notFound } from "next/navigation";
import {
  formatArtistCredit,
  getRecording,
  partitionArtistRelations,
  type RecordingRelease,
} from "@/lib/clients/musicbrainz";
import { caaReleaseUrl } from "@/lib/clients/coverart";
import { CoverArt } from "@/components/achordion/cover-art";
import { PlayOnHoverFab } from "@/components/achordion/play-on-hover-fab";
import { categoriseLinks } from "@/components/achordion/external-links";
import { parachordPlayTrack } from "@/lib/parachord";
import { resolveTrackLinks } from "@/lib/track-links-resolver";
import { faviconUrl } from "@/lib/favicon";

/**
 * Embeddable widget for a single track. Designed to drop into a
 * third-party page via iframe at ~600×180px:
 *
 *   <iframe
 *     src="https://achordion.xyz/embed/track/<mbid>"
 *     width="600"
 *     height="180"
 *     loading="lazy"
 *     style="border: 0; border-radius: 12px; overflow: hidden">
 *   </iframe>
 *
 * The route serves a minimal hero — cover + title + byline + the
 * action row (overflow, inline links, streaming favicons) — and
 * an "Open in Achordion" link that breaks out of the iframe to
 * the canonical recording page.
 *
 * No site nav, no analytics call-outs, no auth. Renders identical
 * HTML for every visitor so it's safe to edge-cache.
 */

export const revalidate = 3600;

interface PageProps {
  params: Promise<{ mbid: string }>;
  searchParams: Promise<{ theme?: string | string[] }>;
}

/** Read the `?theme=` URL param and normalise to a known token.
 *  Anything other than the explicit literals collapses to "dark" so
 *  malformed input fails closed to the same default the embed has
 *  shipped with. */
function resolveTheme(raw: string | string[] | undefined): "light" | "dark" {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "light" ? "light" : "dark";
}

function pickHeroRelease(
  releases: RecordingRelease[] | undefined,
): RecordingRelease | null {
  if (!releases || releases.length === 0) return null;
  const official = releases.filter((r) => r.status === "Official");
  const pool = official.length > 0 ? official : releases;
  return pool
    .slice()
    .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"))[0];
}

function formatLength(ms: number | null | undefined): string | null {
  if (!ms || ms <= 0) return null;
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default async function EmbedTrackPage({
  params,
  searchParams,
}: PageProps) {
  const { mbid } = await params;
  const theme = resolveTheme((await searchParams).theme);
  let recording;
  try {
    recording = await getRecording(mbid);
  } catch {
    notFound();
  }
  const credit = formatArtistCredit(recording["artist-credit"]);
  const heroRelease = pickHeroRelease(recording.releases);
  const heroReleaseGroup = heroRelease?.["release-group"] ?? null;
  const cover = heroRelease ? caaReleaseUrl(heroRelease.id, 250) : null;
  const length = formatLength(recording.length);
  const releaseDate = recording["first-release-date"]?.slice(0, 4) ?? null;
  const { urls } = partitionArtistRelations({
    relations: recording.relations,
  });
  const { streaming } = categoriseLinks(urls);
  const canonicalHref = `https://achordion.xyz/recording/${mbid}`;

  // Cache-first resolve: hits our Upstash track-links store before
  // calling Odesli or re-walking MB. Pre-feed the streaming url-rels
  // we already pulled from the recording above so a cache miss
  // doesn't trigger a duplicate MB round-trip. Renders zero-cost on
  // every cache hit, which is the vast majority once a track has
  // been viewed once.
  const trackLinks = await resolveTrackLinks({
    mbid,
    seedUrl: streaming[0]?.url ?? null,
    prefetched: {
      streamingUrls: streaming.map((s) => ({ url: s.url, type: s.type })),
      names: {
        trackName: recording.title,
        artistName: credit.name,
        albumName: heroReleaseGroup?.title,
      },
    },
  });

  return (
    // `embed-theme-*` re-declares the CSS-var palette on this
    // subtree so the embedder's chosen theme wins over whatever
    // theme the visitor's browser is in (next-themes' `<html
    // class="dark">` toggling does not leak into the embed
    // because the wrapper redeclares the relevant vars).
    <main
      className={`${theme === "light" ? "embed-theme-light" : "embed-theme-dark"} bg-background min-h-screen p-3`}
    >
      {/* `overflow-visible` on the article — was `overflow-hidden`,
          but that clipped the favicon hover-tooltips at the article's
          rounded edge. The cover-art wrapper still clips itself
          (overflow-hidden + rounded-l-xl) so the rounded top-left
          corner survives without the article-level clip. */}
      <article className="border-border/60 flex max-w-2xl items-stretch gap-3 rounded-xl border">
        <div className="group relative aspect-square w-32 shrink-0 overflow-hidden rounded-l-xl sm:w-36">
          <CoverArt
            src={cover}
            alt={recording.title}
            size={250}
            className="aspect-square w-full"
            rounded="none"
          />
          <PlayOnHoverFab
            href={parachordPlayTrack({
              artist: credit.name,
              title: recording.title,
            })}
            label={`Play "${recording.title}" by ${credit.name} in Parachord`}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-between p-3">
          <div className="min-w-0">
            {/* "Open in Achordion" rides on the eyebrow row in the
                upper-right corner. Previous placement (trailing the
                favicon row) put it between two rows of service icons
                on widget heights where favicons wrapped, which made
                the layout look broken. Pinning it to the corner
                keeps the affordance discoverable without crowding
                the icon strip. */}
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-muted-foreground text-[10px] tracking-wide uppercase">
                Track
              </p>
              <Link
                href={canonicalHref}
                target="_top"
                rel="noopener"
                className="text-muted-foreground hover:text-foreground inline-flex shrink-0 items-center gap-1 text-[11px] underline-offset-4 hover:underline"
              >
                Open in Achordion →
              </Link>
            </div>
            <h1 className="mt-0.5 truncate text-lg font-semibold tracking-tight sm:text-xl">
              {/* Title links break out of the iframe to the
                  canonical Achordion page (see `target="_top"`). */}
              <a
                href={canonicalHref}
                target="_top"
                rel="noopener"
                className="hover:underline"
              >
                {recording.title}
              </a>
            </h1>
            <p className="text-muted-foreground mt-1 truncate text-xs">
              {/* Each credit part is its own link to the artist page —
                  same convention as the canonical recording page. The
                  joinphrase (" feat. ", " & ", etc.) is rendered as
                  plain text between links. Iframe-safe: target="_top"
                  breaks out so clicks land on Achordion proper. Falls
                  back to a non-linked span when MB doesn't have an
                  artist MBID on that part. */}
              {credit.parts.map((p, i) => (
                <span key={`${p.id ?? p.name}-${i}`}>
                  {p.id ? (
                    <a
                      href={`https://achordion.xyz/artist/${p.id}`}
                      target="_top"
                      rel="noopener"
                      className="text-foreground hover:underline"
                    >
                      {p.name}
                    </a>
                  ) : (
                    <span className="text-foreground">{p.name}</span>
                  )}
                  {p.join}
                </span>
              ))}
              {heroReleaseGroup && (
                <>
                  <span className="mx-1.5 opacity-50">·</span>
                  <a
                    href={`https://achordion.xyz/release-group/${heroReleaseGroup.id}`}
                    target="_top"
                    rel="noopener"
                    className="italic hover:text-foreground"
                  >
                    {heroReleaseGroup.title}
                  </a>
                </>
              )}
              {releaseDate && (
                <>
                  <span className="mx-1.5 opacity-50">·</span>
                  <span className="tabular-nums">{releaseDate}</span>
                </>
              )}
              {length && (
                <>
                  <span className="mx-1.5 opacity-50">·</span>
                  <span className="tabular-nums">{length}</span>
                </>
              )}
            </p>
          </div>
          <div className="mt-3 flex items-center gap-2">
            {/* Single inline row of streaming services. The resolver
                hits our persistent Upstash cache first, falls back
                to Odesli + MB url-rels on miss, and dedupes by
                canonical host — so the favicons here are the union
                of every source we know about without duplicates.
                No pill / click-to-expand on the embed — the value
                of an embeddable widget is "links you can click
                without thinking." */}
            {trackLinks.length > 0 && (
              <ul
                className="flex flex-wrap items-center gap-2"
                role="list"
              >
                {trackLinks.map((link) => (
                  <li key={link.url}>
                    {/* CSS-only tooltip: pops above the favicon on
                        hover. Native `title` tooltips behave
                        inconsistently inside iframes (long delay,
                        some browsers suppress entirely) and our
                        popover IconTooltip clips against the
                        iframe boundary — a positioned span lets us
                        guarantee visibility within the embed's
                        ~180px height. `title` stays as accessibility
                        + non-hover (touch) fallback. */}
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={link.label}
                      title={link.label}
                      className="group/fav border-border/60 hover:border-foreground/40 hover:bg-muted/40 relative inline-flex size-9 items-center justify-center rounded-md border transition-colors pointer-coarse:size-11"
                    >
                      <span
                        aria-hidden
                        className="bg-foreground text-background pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 rounded-md px-2 py-0.5 text-[10px] font-medium whitespace-nowrap opacity-0 shadow-sm transition-opacity duration-150 group-hover/fav:opacity-100"
                      >
                        {link.label}
                      </span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={faviconUrl(link.host)}
                        alt=""
                        width={16}
                        height={16}
                        loading="lazy"
                        className="size-4 opacity-80 hover:opacity-100"
                      />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </article>
    </main>
  );
}

export async function generateMetadata({ params }: PageProps) {
  const { mbid } = await params;
  try {
    const r = await getRecording(mbid);
    const credit = formatArtistCredit(r["artist-credit"]);
    return {
      title: credit.name ? `${r.title} — ${credit.name}` : r.title,
      // Don't index embed pages — the canonical recording URL is
      // /recording/<mbid> and search engines should land users there.
      robots: { index: false, follow: false },
    };
  } catch {
    return { title: "Track", robots: { index: false, follow: false } };
  }
}
