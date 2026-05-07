import { ExternalLink, Star } from "lucide-react";
import {
  getReleaseGroupReviews,
  type CritiqueBrainzReview,
} from "@/lib/clients/critiquebrainz";
import {
  findAlbumWikipediaUrl,
  getCriticalReception,
  type WikipediaCriticalReception,
} from "@/lib/clients/wikipedia";
import type { ArtistExternalLink } from "@/lib/clients/musicbrainz";
import { stripHtml } from "@/lib/strip-html";
import { safeHttpUrl } from "./external-links";

const SNIPPET_CHARS = 480;

interface AlbumReviewsProps {
  mbid: string;
  /**
   * MB url-rels from the release group + canonical release. Used to
   * locate the album's Wikipedia page for the "Critical reception"
   * fallback when CritiqueBrainz has no reviews.
   */
  urls: ArtistExternalLink[];
}

/**
 * Editorial reviews for an album. Tries CritiqueBrainz first; falls
 * back to a preview of the album's Wikipedia "Critical reception"
 * section when CB has no reviews. Renders nothing when neither source
 * has anything — sparse coverage is the norm.
 */
export async function AlbumReviews({ mbid, urls }: AlbumReviewsProps) {
  const wikipediaUrl = findAlbumWikipediaUrl(urls);
  const [cbReviews, reception] = await Promise.all([
    getReleaseGroupReviews(mbid).catch(() => [] as CritiqueBrainzReview[]),
    wikipediaUrl
      ? getCriticalReception(wikipediaUrl).catch(() => null)
      : Promise.resolve(null),
  ]);

  if (cbReviews.length === 0 && !reception) return null;

  return (
    <section>
      <h2 className="mb-4 text-sm font-semibold tracking-wide uppercase">
        Reviews
      </h2>
      {cbReviews.length > 0 ? (
        <CritiqueBrainzReviews reviews={cbReviews} />
      ) : (
        reception && <WikipediaReception reception={reception} />
      )}
    </section>
  );
}

function CritiqueBrainzReviews({
  reviews,
}: {
  reviews: CritiqueBrainzReview[];
}) {
  return (
    <ul className="space-y-3">
      {reviews.map((r) => (
        <li
          key={r.id}
          className="border-border/60 bg-card/30 rounded-xl border p-5"
        >
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {r.userName && (
              <span className="text-foreground font-medium">{r.userName}</span>
            )}
            {r.rating !== null && <RatingStars value={r.rating} />}
            {r.publishedOn && (
              <time dateTime={r.publishedOn}>{formatDate(r.publishedOn)}</time>
            )}
          </div>
          <p className="text-foreground max-w-3xl text-sm leading-7">
            {snippet(r.text)}
          </p>
          <a
            href={`https://critiquebrainz.org/review/${r.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground mt-3 inline-flex items-center gap-1.5 text-xs"
          >
            <ExternalLink className="size-3" />
            Read on CritiqueBrainz
          </a>
        </li>
      ))}
    </ul>
  );
}

function WikipediaReception({
  reception,
}: {
  reception: WikipediaCriticalReception;
}) {
  const safeUrl = safeHttpUrl(reception.url);
  return (
    <div className="border-border/60 bg-card/30 rounded-xl border p-5">
      <div className="text-muted-foreground mb-2 text-xs tracking-wide uppercase">
        Critical reception
      </div>
      <p className="text-foreground max-w-3xl text-sm leading-7">
        {reception.text}
      </p>
      {safeUrl && (
        <a
          href={safeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground mt-3 inline-flex items-center gap-1.5 text-xs"
        >
          <ExternalLink className="size-3" />
          Read on {reception.source}
        </a>
      )}
    </div>
  );
}

function RatingStars({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span
      className="inline-flex items-center gap-0.5"
      aria-label={`Rated ${clamped} out of 5`}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={
            i < clamped
              ? "size-3.5 fill-current text-amber-500"
              : "size-3.5 text-muted-foreground/40"
          }
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

function snippet(text: string): string {
  const plain = stripHtml(text);
  if (plain.length <= SNIPPET_CHARS) return plain;
  return plain.slice(0, SNIPPET_CHARS).replace(/\s+\S*$/, "") + "…";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
