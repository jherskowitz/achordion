import Link from "next/link";
import { artistHref } from "@/lib/entity-links";
import { formatArtistCredit } from "@/lib/clients/musicbrainz";

/**
 * Render an MB artist-credit as a sequence of linked names with the
 * original join phrases preserved between them.
 *
 *   Spotify "Artist A feat. Artist B"
 *   →  <Artist A> feat. <Artist B>
 *      (each name is a Link; "feat. " / " & " / etc. is plain text.)
 *
 * Used in any byline that surfaces MB credits — track rows on
 * compilations, the album-page byline, the recording-page byline.
 * Each name links direct to /artist/<mbid> when MB has the id, else
 * to /artist/lookup?name=… so unknown collaborators still navigate.
 */
export function ArtistCreditLinks({
  parts,
  className,
}: {
  parts: ReturnType<typeof formatArtistCredit>["parts"];
  className?: string;
}) {
  if (parts.length === 0) return null;
  return (
    <>
      {parts.map((p, i) => (
        <span key={`${p.id ?? p.name}-${i}`}>
          <Link
            href={artistHref({ mbid: p.id, name: p.name })}
            className={className ?? "hover:text-foreground hover:underline"}
          >
            {p.name}
          </Link>
          {p.join}
        </span>
      ))}
    </>
  );
}
