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
import { parachordPlayTrack } from "@/lib/parachord";
import { CoverArt } from "@/components/achordion/cover-art";
import { ExternalLinks } from "@/components/achordion/external-links";
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
        breadcrumbs={[{ label: "Tracks" }, { label: recording.title }]}
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
            <ParachordCtaButton
              href={parachordPlayTrack({
                artist: credit.name,
                title: recording.title,
              })}
              label={`Play in Parachord`}
            />
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
                      <Link
                        href={`/release-group/${rg.id}`}
                        className="group block"
                      >
                        <CoverArt
                          src={caaReleaseUrl(r.id, 500)}
                          alt={rg.title}
                          size={500}
                          className="aspect-square w-full transition-opacity group-hover:opacity-90"
                          rounded="md"
                        />
                        <p className="mt-2 truncate text-sm font-medium">
                          {rg.title}
                        </p>
                        {r.date && (
                          <p className="text-muted-foreground/70 text-xs tabular-nums">
                            {r.date.slice(0, 4)}
                          </p>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-8">
          {urls.length > 0 && (
            <div>
              <h3 className="mb-3 text-xs tracking-wide uppercase text-muted-foreground">
                Links
              </h3>
              <ExternalLinks links={urls} />
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
