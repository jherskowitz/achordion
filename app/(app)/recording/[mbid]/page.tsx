import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import {
  dedupeReleaseGroups,
  formatArtistCredit,
  getRecording,
  partitionArtistRelations,
  type RecordingRelease,
} from "@/lib/clients/musicbrainz";
import { getRecordingPopularity } from "@/lib/clients/listenbrainz";
import { caaReleaseUrl } from "@/lib/clients/coverart";
import { parachordPlayAlbum, parachordPlayTrack } from "@/lib/parachord";
import { CoverArt } from "@/components/achordion/cover-art";
import { PlayOnHoverFab } from "@/components/achordion/play-on-hover-fab";
import {
  ExternalLinks,
  categoriseLinks,
} from "@/components/achordion/external-links";
import { OdesliLinks } from "@/components/achordion/odesli-links";
import { PageHeader } from "@/components/achordion/page-header";
import { PageShell } from "@/components/achordion/page-shell";
import { ParachordCtaButton } from "@/components/achordion/parachord-button";

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

/** Pick the recording's hero release: official + earliest, falling back. */
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

async function RecordingBody({ mbid }: { mbid: string }) {
  let recording;
  try {
    recording = await getRecording(mbid);
  } catch {
    notFound();
  }

  const credit = formatArtistCredit(recording["artist-credit"]);
  const heroRelease = pickHeroRelease(recording.releases);
  const heroReleaseGroup = heroRelease?.["release-group"] ?? null;
  const otherReleaseGroups = dedupeReleaseGroups(recording.releases).filter(
    (r) => r["release-group"]?.id !== heroReleaseGroup?.id,
  );
  const length = formatLength(recording.length);
  const popularity = await getRecordingPopularity(mbid).catch(() => null);
  const cover = heroRelease ? caaReleaseUrl(heroRelease.id, 500) : null;
  const { urls } = partitionArtistRelations({
    relations: recording.relations,
  });
  // Use the first MB streaming url-rel (Spotify / Apple / etc.) as the
  // seed for Odesli's cross-service lookup. Sidebar "Other Links" gets
  // everything that isn't a streaming service so we don't double-show
  // Spotify both there and in the favicon row.
  const { streaming: streamingUrls, other: otherUrls } = categoriseLinks(urls);
  const odesliSeed = streamingUrls[0]?.url ?? null;
  const tags = (recording.genres?.length
    ? recording.genres
    : recording.tags ?? []
  )
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const releaseDate = recording["first-release-date"]?.slice(0, 4) ?? null;

  return (
    <>
      <PageHeader
        leading={
          <CoverArt
            src={cover}
            alt={recording.title}
            size={500}
            className="aspect-square w-32 sm:w-40"
            rounded="md"
          />
        }
        eyebrow="Track"
        title={recording.title}
        description={
          <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1">
            {credit.parts.map((p, i) => (
              <span key={`${p.id ?? p.name}-${i}`}>
                {p.id ? (
                  <Link
                    href={`/artist/${p.id}`}
                    className="text-foreground hover:underline"
                  >
                    {p.name}
                  </Link>
                ) : (
                  p.name
                )}
                {p.join}
              </span>
            ))}
            {heroReleaseGroup && (
              <>
                <span className="text-muted-foreground/70">·</span>
                <Link
                  href={`/release-group/${heroReleaseGroup.id}`}
                  className="text-muted-foreground hover:text-foreground italic underline-offset-4 hover:underline"
                >
                  {heroReleaseGroup.title}
                </Link>
              </>
            )}
            {releaseDate && (
              <>
                <span className="text-muted-foreground/70">·</span>
                <span className="text-muted-foreground tabular-nums">
                  {releaseDate}
                </span>
              </>
            )}
            {length && (
              <>
                <span className="text-muted-foreground/70">·</span>
                <span className="text-muted-foreground tabular-nums">
                  {length}
                </span>
              </>
            )}
            {recording.disambiguation && (
              <>
                <span className="text-muted-foreground/70">·</span>
                <em className="text-muted-foreground">
                  {recording.disambiguation}
                </em>
              </>
            )}
          </span>
        }
        breadcrumbs={[
          // Artist → Album → Track. Use the primary credited artist
          // (formatArtistCredit's first part) so guest features don't
          // pollute the trail. Album crumb is the hero release group
          // we already picked for the cover/title.
          ...(credit.parts[0]
            ? [
                {
                  label: credit.parts[0].name,
                  ...(credit.parts[0].id
                    ? { href: `/artist/${credit.parts[0].id}` }
                    : {}),
                },
              ]
            : []),
          ...(heroReleaseGroup
            ? [
                {
                  label: heroReleaseGroup.title,
                  href: `/release-group/${heroReleaseGroup.id}`,
                },
              ]
            : []),
          { label: recording.title },
        ]}
        actions={
          popularity ? (
            <div className="flex items-baseline gap-6 text-right">
              <div>
                <p className="text-foreground text-2xl font-semibold tabular-nums">
                  {popularity.totalListenCount.toLocaleString()}
                </p>
                <p className="text-muted-foreground text-xs tracking-wide uppercase">
                  listens
                </p>
              </div>
              <div>
                <p className="text-foreground text-2xl font-semibold tabular-nums">
                  {popularity.totalUserCount.toLocaleString()}
                </p>
                <p className="text-muted-foreground text-xs tracking-wide uppercase">
                  listeners
                </p>
              </div>
            </div>
          ) : undefined
        }
      />

      {tags.length > 0 && (
        <div className="-mt-2 flex flex-wrap gap-1.5 pb-4">
          {tags.map((t) => (
            <Link
              key={t.name}
              href={`/tag/${encodeURIComponent(t.name)}`}
              className="bg-muted text-muted-foreground hover:bg-foreground/15 hover:text-foreground rounded-full px-2.5 py-0.5 text-xs transition-colors"
            >
              {t.name}
            </Link>
          ))}
        </div>
      )}

      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_240px]">
        <div className="min-w-0 space-y-12">
          <section>
            {/* Play button + cross-service favicon row inline. The
                Odesli call is cached for 24h per seed URL so it stays
                well under the 10 req/min free-tier ceiling, and the
                row renders nothing when Odesli has no usable data. */}
            <div className="flex flex-wrap items-center gap-3">
              <ParachordCtaButton
                href={parachordPlayTrack({
                  artist: credit.name,
                  title: recording.title,
                })}
                label={`Play in Parachord`}
              />
              <Suspense fallback={null}>
                <OdesliLinks seedUrl={odesliSeed} />
              </Suspense>
            </div>
          </section>

          {otherReleaseGroups.length > 0 && (
            <section>
              <h2 className="mb-4 text-sm font-semibold tracking-wide uppercase">
                Also appears on
              </h2>
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                {otherReleaseGroups.map((r) => {
                  const rg = r["release-group"];
                  if (!rg) return null;
                  return (
                    <li key={rg.id} className="min-w-0">
                      <div className="group relative overflow-hidden rounded-md">
                        <Link
                          href={`/release-group/${rg.id}`}
                          className="block"
                        >
                          <CoverArt
                            src={caaReleaseUrl(r.id, 500)}
                            alt={rg.title}
                            size={500}
                            className="aspect-square w-full transition-opacity group-hover:opacity-90"
                            rounded="md"
                          />
                        </Link>
                        <PlayOnHoverFab
                          href={parachordPlayAlbum({ mbid: rg.id })}
                          label={`Play "${rg.title}" in Parachord`}
                        />
                      </div>
                      <p className="mt-2 truncate text-sm font-medium">
                        <Link
                          href={`/release-group/${rg.id}`}
                          className="hover:underline"
                        >
                          {rg.title}
                        </Link>
                      </p>
                      {r.date && (
                        <p className="text-muted-foreground/70 text-xs tabular-nums">
                          {r.date.slice(0, 4)}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-8">
          {otherUrls.length > 0 && (
            <div>
              <h3 className="mb-3 text-xs tracking-wide uppercase text-muted-foreground">
                Other Links
              </h3>
              <ExternalLinks links={otherUrls} />
            </div>
          )}
          {recording.isrcs && recording.isrcs.length > 0 && (
            <div>
              <h3 className="mb-3 text-xs tracking-wide uppercase text-muted-foreground">
                ISRCs
              </h3>
              <ul className="space-y-1 font-mono text-xs">
                {recording.isrcs.map((isrc) => (
                  <li key={isrc} className="text-muted-foreground">
                    {isrc}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="border-border/60 border-t pt-4">
            <a
              href={`https://musicbrainz.org/recording/${recording.id}/edit`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground/70 hover:text-foreground inline-flex items-center gap-1.5 text-xs"
            >
              <Pencil className="size-3" />
              Edit on MusicBrainz
            </a>
          </div>
        </aside>
      </div>
    </>
  );
}

export async function generateMetadata({ params }: PageProps) {
  const { mbid } = await params;
  try {
    const r = await getRecording(mbid);
    const credit = formatArtistCredit(r["artist-credit"]);
    return {
      title: credit.name ? `${r.title} — ${credit.name}` : r.title,
    };
  } catch {
    return { title: "Track" };
  }
}

export default async function RecordingPage({ params }: PageProps) {
  const { mbid } = await params;
  return (
    <PageShell>
      <Suspense fallback={null}>
        <RecordingBody mbid={mbid} />
      </Suspense>
    </PageShell>
  );
}
