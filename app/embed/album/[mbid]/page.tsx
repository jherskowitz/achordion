import Link from "next/link";
import { notFound } from "next/navigation";
import {
  formatArtistCredit,
  getRelease,
  getReleaseGroup,
  partitionArtistRelations,
  pickCanonicalRelease,
} from "@/lib/clients/musicbrainz";
import { caaReleaseGroupUrl } from "@/lib/clients/coverart";
import { CoverArt } from "@/components/achordion/cover-art";
import { PlayOnHoverFab } from "@/components/achordion/play-on-hover-fab";
import { categoriseLinks } from "@/components/achordion/external-links";
import { InlineTrackLinks } from "@/components/achordion/inline-track-links";
import { parachordPlayAlbum } from "@/lib/parachord";
import { resolveTrackLinks } from "@/lib/track-links-resolver";
import { faviconUrl } from "@/lib/favicon";

/**
 * Embeddable widget for a single album (release-group). Drops into a
 * third-party page via iframe at ~600×260px (collapsed):
 *
 *   <iframe
 *     src="https://achordion.xyz/embed/album/<mbid>"
 *     width="600"
 *     height="260"
 *     loading="lazy"
 *     style="border: 0; border-radius: 12px; overflow: hidden">
 *   </iframe>
 *
 * Mirrors the track embed's hero (cover + title + byline + favicon
 * row + breakout link) and adds a `<details>` accordion for the
 * tracklist. Each track row has its own click-to-expand
 * `<InlineTrackLinks>` pill so listeners can play any specific track
 * directly without leaving the embed.
 *
 * Why `<details>` rather than a client toggle: pure HTML, no JS, no
 * hydration cost on the iframe page. The iframe's parent gets the
 * 260px collapsed height from the snippet; when the user expands
 * the accordion the iframe's internal scroll handles overflow.
 *
 * No site nav, no analytics call-outs, no auth. Renders identical
 * HTML for every visitor so it's safe to edge-cache.
 */

export const revalidate = 3600;

interface PageProps {
  params: Promise<{ mbid: string }>;
}

function formatLength(ms: number | null | undefined): string | null {
  if (!ms || ms <= 0) return null;
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default async function EmbedAlbumPage({ params }: PageProps) {
  const { mbid } = await params;
  let rg: Awaited<ReturnType<typeof getReleaseGroup>>;
  try {
    rg = await getReleaseGroup(mbid);
  } catch {
    notFound();
  }
  const canonicalRelease = pickCanonicalRelease(rg);
  const release = canonicalRelease
    ? await getRelease(canonicalRelease.id).catch(() => null)
    : null;

  const credit = formatArtistCredit(rg["artist-credit"]);
  const cover = caaReleaseGroupUrl(rg.id, 250);
  const year = rg["first-release-date"]?.slice(0, 4) ?? null;

  // Aggregate streaming url-rels from BOTH the release-group level
  // and the canonical release — release-level rels (Spotify album
  // URL, Apple Music album URL) are usually denser than rg-level
  // rels, so merging gives us the fullest seed for the resolver.
  const rgUrls = partitionArtistRelations(rg).urls;
  const releaseUrls = release
    ? partitionArtistRelations({ relations: release.relations }).urls
    : [];
  const urls = Array.from(
    new Map([...rgUrls, ...releaseUrls].map((l) => [l.url, l])).values(),
  );
  const { streaming } = categoriseLinks(urls);

  // Cache-first resolve — same machinery the album page uses, just
  // server-awaited here since we want the favicons baked into the
  // SSR HTML for the embed (no client island in the iframe).
  const albumLinks = await resolveTrackLinks({
    mbid,
    entity: "release-group",
    seedUrl: streaming[0]?.url ?? null,
    prefetched: {
      streamingUrls: streaming.map((s) => ({ url: s.url, type: s.type })),
      names: {
        albumName: rg.title,
        ...(credit.name ? { artistName: credit.name } : {}),
      },
    },
  });

  const tracks = release?.media?.flatMap((m) => m.tracks ?? []) ?? [];
  const canonicalHref = `https://achordion.xyz/release-group/${mbid}`;

  return (
    <main className="bg-background min-h-screen p-3">
      <article className="border-border/60 max-w-2xl overflow-hidden rounded-xl border">
        <div className="flex items-stretch gap-3">
          <div className="group relative aspect-square w-32 shrink-0 overflow-hidden sm:w-36">
            <CoverArt
              src={cover}
              alt={rg.title}
              size={250}
              className="aspect-square w-full"
              rounded="none"
            />
            <PlayOnHoverFab
              href={parachordPlayAlbum({ mbid: rg.id })}
              label={`Play "${rg.title}" by ${credit.name} in Parachord`}
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-between p-3">
            <div className="min-w-0">
              <p className="text-muted-foreground text-[10px] tracking-wide uppercase">
                {rg["primary-type"] ?? "Album"}
              </p>
              <h1 className="mt-0.5 truncate text-lg font-semibold tracking-tight sm:text-xl">
                <a
                  href={canonicalHref}
                  target="_top"
                  rel="noopener"
                  className="hover:underline"
                >
                  {rg.title}
                </a>
              </h1>
              <p className="text-muted-foreground mt-1 truncate text-xs">
                <span className="text-foreground">{credit.name}</span>
                {year && (
                  <>
                    <span className="mx-1.5 opacity-50">·</span>
                    <span className="tabular-nums">{year}</span>
                  </>
                )}
                {tracks.length > 0 && (
                  <>
                    <span className="mx-1.5 opacity-50">·</span>
                    <span className="tabular-nums">
                      {tracks.length} tracks
                    </span>
                  </>
                )}
              </p>
            </div>
            <div className="mt-3 flex items-center gap-2">
              {albumLinks.length > 0 && (
                <ul
                  className="flex flex-wrap items-center gap-2"
                  role="list"
                >
                  {albumLinks.map((link) => (
                    <li key={link.url}>
                      {/* CSS-only tooltip: pops above the favicon —
                          escapes the iframe boundary cleanly. Same
                          pattern as the track embed. */}
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
              <Link
                href={canonicalHref}
                target="_top"
                rel="noopener"
                className="text-muted-foreground hover:text-foreground ml-auto inline-flex shrink-0 items-center gap-1 text-[11px] underline-offset-4 hover:underline"
              >
                Open in Achordion →
              </Link>
            </div>
          </div>
        </div>

        {/* Tracklist accordion. `<details>` is native HTML — pure CSS
            toggle, no JS hydration. Collapsed by default so the
            embed's snippet height (260px) fits the hero alone; when
            a viewer expands it the iframe's internal scroll handles
            overflow. */}
        {tracks.length > 0 && (
          <details className="border-border/60 border-t group/details">
            <summary className="text-muted-foreground hover:text-foreground hover:bg-muted/30 flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs transition-colors">
              <span>
                Tracklist
                <span className="text-muted-foreground/70 ml-1.5 tabular-nums">
                  ({tracks.length})
                </span>
              </span>
              <span className="text-muted-foreground/70 transition-transform group-open/details:rotate-180">
                ▾
              </span>
            </summary>
            <ol className="border-border/60 divide-border/60 divide-y border-t">
              {tracks.map((t, i) => {
                const recordingMbid = t.recording?.id ?? null;
                const lengthMs = t.length ?? t.recording?.length ?? null;
                const length = formatLength(lengthMs);
                const trackHref = recordingMbid
                  ? `https://achordion.xyz/recording/${recordingMbid}`
                  : null;
                return (
                  <li
                    key={`${recordingMbid ?? "no-mbid"}-${i}`}
                    className="flex items-center gap-2 px-3 py-2"
                  >
                    <span className="text-muted-foreground/70 w-6 shrink-0 text-xs tabular-nums">
                      {t.position ?? i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {trackHref ? (
                        <a
                          href={trackHref}
                          target="_top"
                          rel="noopener"
                          className="hover:underline"
                        >
                          {t.title}
                        </a>
                      ) : (
                        t.title
                      )}
                    </span>
                    {recordingMbid && (
                      // Per-track click-to-expand favicon pill —
                      // lazy-fetches /api/track-links on click so the
                      // accordion stays cheap to expand even on big
                      // albums. Sits left of the duration so the
                      // right edge mirrors the album-page tracklist.
                      <InlineTrackLinks recordingMbid={recordingMbid} />
                    )}
                    {length && (
                      <span className="text-muted-foreground/70 shrink-0 text-xs tabular-nums">
                        {length}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </details>
        )}
      </article>
    </main>
  );
}

export async function generateMetadata({ params }: PageProps) {
  const { mbid } = await params;
  try {
    const rg = await getReleaseGroup(mbid);
    const credit = formatArtistCredit(rg["artist-credit"]);
    return {
      title: credit.name ? `${rg.title} — ${credit.name}` : rg.title,
      // Don't index embed pages — the canonical /release-group URL is
      // the search-engine destination.
      robots: { index: false, follow: false },
    };
  } catch {
    return { title: "Album", robots: { index: false, follow: false } };
  }
}
