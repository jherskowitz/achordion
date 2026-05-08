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
import { InlineTrackLinks } from "@/components/achordion/inline-track-links";
import { categoriseLinks } from "@/components/achordion/external-links";
import { OdesliLinks } from "@/components/achordion/odesli-links";
import { parachordPlayTrack } from "@/lib/parachord";

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

export default async function EmbedTrackPage({ params }: PageProps) {
  const { mbid } = await params;
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
  const odesliSeed = streaming[0]?.url ?? null;
  const canonicalHref = `https://achordion.xyz/recording/${mbid}`;

  return (
    <main className="bg-background min-h-screen p-3">
      <article className="border-border/60 flex max-w-2xl items-stretch gap-3 overflow-hidden rounded-xl border">
        <div className="group relative aspect-square w-32 shrink-0 overflow-hidden sm:w-36">
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
            <p className="text-muted-foreground text-[10px] tracking-wide uppercase">
              Track
            </p>
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
              <span className="text-foreground">{credit.name}</span>
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
            <InlineTrackLinks recordingMbid={mbid} seedUrl={odesliSeed} />
            {/* Server-rendered streaming favicons fill the rest of
                the row inline so the iframe renders useful content
                without needing a click to expand. */}
            <span className="ml-auto inline-flex shrink-0 items-center gap-1">
              <OdesliLinks
                seedUrl={odesliSeed}
                mbStreamingLinks={streaming}
              />
            </span>
            <Link
              href={canonicalHref}
              target="_top"
              rel="noopener"
              className="text-muted-foreground hover:text-foreground inline-flex shrink-0 items-center gap-1 text-[11px] underline-offset-4 hover:underline"
            >
              Open in Achordion →
            </Link>
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
