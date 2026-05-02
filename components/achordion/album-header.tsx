import Link from "next/link";
import { CoverArt } from "./cover-art";
import { caaReleaseGroupUrl } from "@/lib/clients/coverart";
import type { ReleaseGroupDetail } from "@/lib/clients/musicbrainz";
import { formatArtistCredit } from "@/lib/clients/musicbrainz";
import { ParachordCtaButton } from "./parachord-button";
import { parachordPlayAlbum, type ParachordTrack } from "@/lib/parachord";

interface AlbumHeaderProps {
  rg: ReleaseGroupDetail;
  totalListens?: number;
  totalListeners?: number;
  parachordTracks?: ParachordTrack[];
}

function ArtistByline({
  parts,
}: {
  parts: ReturnType<typeof formatArtistCredit>["parts"];
}) {
  if (parts.length === 0) return <>Unknown artist</>;
  return (
    <>
      {parts.map((p, i) => (
        <span key={`${p.id ?? p.name}-${i}`}>
          {p.id ? (
            <Link
              href={`/artist/${p.id}`}
              className="hover:text-foreground hover:underline underline-offset-4"
            >
              {p.name}
            </Link>
          ) : (
            p.name
          )}
          {p.join}
        </span>
      ))}
    </>
  );
}

export function AlbumHeader({
  rg,
  totalListens,
  totalListeners,
  parachordTracks,
}: AlbumHeaderProps) {
  const credit = formatArtistCredit(rg["artist-credit"]);
  const year = rg["first-release-date"]?.slice(0, 4);
  const tagsSource = rg.genres?.length ? rg.genres : rg.tags ?? [];
  const tags = tagsSource
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  return (
    <header className="mt-8 mb-10 grid gap-6 sm:grid-cols-[200px_1fr] sm:gap-8">
      <CoverArt
        src={caaReleaseGroupUrl(rg.id, 500)}
        alt={rg.title}
        size={500}
        className="aspect-square h-auto w-full max-w-[280px] sm:max-w-none"
        rounded="md"
      />
      <div className="flex min-w-0 flex-col justify-end">
        <p className="text-muted-foreground text-xs tracking-wide uppercase">
          {rg["primary-type"] ?? "Release"}
          {rg["secondary-types"]?.length ? (
            <> · {rg["secondary-types"].join(" · ")}</>
          ) : null}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl md:text-5xl">
          {rg.title}
        </h1>
        <p className="text-muted-foreground mt-3 text-base">
          <ArtistByline parts={credit.parts} />
          {year && <span> · {year}</span>}
        </p>
        {rg.disambiguation && (
          <p className="text-muted-foreground/70 mt-1 text-sm italic">
            {rg.disambiguation}
          </p>
        )}
        {(totalListens !== undefined || totalListeners !== undefined) && (
          <p className="text-muted-foreground mt-4 text-sm tabular-nums">
            {totalListens !== undefined && (
              <>
                <span className="text-foreground font-medium">
                  {totalListens.toLocaleString()}
                </span>{" "}
                listens
              </>
            )}
            {totalListeners !== undefined && totalListens !== undefined && " · "}
            {totalListeners !== undefined && (
              <>
                <span className="text-foreground font-medium">
                  {totalListeners.toLocaleString()}
                </span>{" "}
                listeners
              </>
            )}
          </p>
        )}
        {tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
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
        {/* Prefer the MBID — Parachord picks the best resolver. Fall back
            to title+artist or an inline tracklist if needed. */}
        {(rg.id || (parachordTracks && parachordTracks.length > 0)) && (
          <div className="mt-5">
            <ParachordCtaButton
              href={parachordPlayAlbum({
                ...(rg.id
                  ? { mbid: rg.id }
                  : {
                      artist: credit.name,
                      title: rg.title,
                      tracks: parachordTracks,
                    }),
              })}
              label="Play in Parachord"
            />
          </div>
        )}
      </div>
    </header>
  );
}
