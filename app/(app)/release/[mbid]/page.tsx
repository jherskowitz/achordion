import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatArtistCredit, getRelease } from "@/lib/clients/musicbrainz";
import { caaReleaseUrl } from "@/lib/clients/coverart";
import { CoverArt } from "@/components/achordion/cover-art";
import { TrackList } from "@/components/achordion/track-list";
import { PageShell } from "@/components/achordion/page-shell";
import { Skeleton } from "@/components/ui/skeleton";

interface PageParams {
  params: Promise<{ mbid: string }>;
}

async function ReleaseBody({ mbid }: { mbid: string }) {
  let release;
  try {
    release = await getRelease(mbid);
  } catch {
    notFound();
  }

  // /release-group is the canonical "album" page; if this release has one,
  // surface the link prominently. We don't auto-redirect because users might
  // want to inspect a specific edition.
  const rg = release["release-group"];
  const credit = formatArtistCredit(release["artist-credit"]);
  const year = release.date?.slice(0, 4);

  return (
    <>
      <header className="mt-8 mb-10 grid grid-cols-1 gap-6 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-8">
        <CoverArt
          src={caaReleaseUrl(release.id, 500)}
          alt={release.title}
          size={500}
          className="aspect-square h-auto w-full max-w-[220px] sm:max-w-none"
          rounded="md"
        />
        <div className="flex min-w-0 flex-col justify-end">
          <p className="text-muted-foreground text-xs tracking-wide uppercase">
            Release
            {release.status && release.status !== "Official" && (
              <> · {release.status}</>
            )}
            {release.country && <> · {release.country}</>}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {release.title}
          </h1>
          <p className="text-muted-foreground mt-3 text-sm">
            {credit.primaryArtistId ? (
              <Link
                href={`/artist/${credit.primaryArtistId}`}
                className="hover:text-foreground hover:underline underline-offset-4"
              >
                {credit.name}
              </Link>
            ) : (
              credit.name
            )}
            {year && <span> · {year}</span>}
          </p>
          {rg && (
            <p className="mt-3 text-sm">
              <Link
                href={`/release-group/${rg.id}`}
                className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
              >
                ← Back to {rg.title}
              </Link>
            </p>
          )}
        </div>
      </header>

      <section>
        <h2 className="mb-4 text-sm font-semibold tracking-wide uppercase">
          Tracks
        </h2>
        <TrackList release={release} />
      </section>
    </>
  );
}

function Fallback() {
  return (
    <div className="mt-8 mb-10 grid grid-cols-1 gap-6 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-8">
      <Skeleton className="aspect-square w-full max-w-[220px] rounded-md" />
      <div className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-4 w-40" />
      </div>
    </div>
  );
}

export default async function ReleasePage({ params }: PageParams) {
  const { mbid } = await params;
  return (
    <PageShell>
      <Suspense fallback={<Fallback />}>
        <ReleaseBody mbid={mbid} />
      </Suspense>
    </PageShell>
  );
}

