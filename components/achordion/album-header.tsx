import type { ReactNode } from "react";
import Link from "next/link";
import { CoverArt } from "./cover-art";
import { caaReleaseGroupUrl } from "@/lib/clients/coverart";
import type {
  ArtistExternalLink,
  ReleaseGroupDetail,
} from "@/lib/clients/musicbrainz";
import { formatArtistCredit } from "@/lib/clients/musicbrainz";
import { ParachordCtaButton } from "./parachord-button";
import { ExternalLinks } from "./external-links";
import { TagChips } from "./tag-chips";
import { parachordPlayAlbum, type ParachordTrack } from "@/lib/parachord";

interface AlbumHeaderProps {
  rg: ReleaseGroupDetail;
  totalListens?: number;
  totalListeners?: number;
  parachordTracks?: ParachordTrack[];
  /**
   * Streaming-service url-rels (Spotify / Apple / Bandcamp / etc.)
   * rendered as a favicon row inline with the Play in Parachord
   * button. Pass the merged rg-level + release-level streaming subset.
   */
  streamingLinks?: ArtistExternalLink[];
  /**
   * When provided, replaces the inline `totalListens / totalListeners`
   * stats block with this node. Lets the page wrap a Suspense around
   * the LB stats fetch so the rest of the header paints without
   * waiting on it.
   */
  statsSlot?: ReactNode;
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
          <Link
            href={
              p.id
                ? `/artist/${p.id}`
                : `/artist/lookup?name=${encodeURIComponent(p.name)}`
            }
            className="hover:text-foreground hover:underline underline-offset-4"
          >
            {p.name}
          </Link>
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
  streamingLinks,
  statsSlot,
}: AlbumHeaderProps) {
  const credit = formatArtistCredit(rg["artist-credit"]);
  const year = rg["first-release-date"]?.slice(0, 4);
  const tagsSource = rg.genres?.length ? rg.genres : rg.tags ?? [];
  const tags = tagsSource
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  return (
    <header className="mt-8 mb-10 grid grid-cols-1 gap-6 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-8">
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
        {/* Stats: prefer the slot when the page passes one (so a
            Suspense'd LB stats fetch can stream into the header
            without blocking initial paint); fall back to the inline
            block when the page resolves stats synchronously. */}
        {statsSlot ? (
          <div className="mt-4">{statsSlot}</div>
        ) : (
          (totalListens !== undefined || totalListeners !== undefined) && (
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
          )
        )}
        <div className="mt-4 flex flex-wrap gap-1.5">
          <TagChips
            entity="release-group"
            mbid={rg.id}
            initialTags={tags}
          />
        </div>
        {/* Prefer the MBID — Parachord picks the best resolver. Fall back
            to title+artist or an inline tracklist if needed. The
            streaming favicon row sits inline with the Play button on
            wider screens, wrapping below it on narrow ones. */}
        {(rg.id || (parachordTracks && parachordTracks.length > 0)) && (
          <div className="mt-5 flex flex-wrap items-center gap-3">
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
            {/* Always show the row when we have an MBID — empty
                streaming list still gets the "+" affordance so users
                can seed Spotify / Apple etc. on MB. */}
            {rg.id && (
              <ExternalLinks
                links={streamingLinks ?? []}
                addSources={{ mbEntity: "release-group", mbid: rg.id }}
              />
            )}
          </div>
        )}
      </div>
    </header>
  );
}
