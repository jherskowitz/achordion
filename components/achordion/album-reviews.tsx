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
import { getWikidataEnWikipediaUrl } from "@/lib/clients/wikidata";
import type { ArtistExternalLink } from "@/lib/clients/musicbrainz";
import { stripHtml } from "@/lib/strip-html";
import { safeHttpUrl } from "./external-links";
import { isFeatureEnabledForViewer } from "@/lib/flags";
import { hasCbConnection } from "@/lib/cb-token";
import { WriteReviewForm } from "./write-review-form";

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
  const [canRead, canWrite] = await Promise.all([
    isFeatureEnabledForViewer("reviews"),
    isFeatureEnabledForViewer("write_reviews"),
  ]);
  if (!canRead && !canWrite) return null;

  // Many MB release groups link to Wikidata (`Q...`) rather than a
  // direct Wikipedia rel — Radiohead's "In Rainbows" is a typical
  // example. Fall back to resolving the wikidata Q-id to its `enwiki`
  // sitelink so the Wikipedia "Critical reception" preview still
  // surfaces in those cases.
  const directWikiUrl = findAlbumWikipediaUrl(urls);
  const wikidataUrl =
    !directWikiUrl
      ? urls.find((l) => /\/\/www\.wikidata\.org\/wiki\/Q\d+/i.test(l.url))
          ?.url ?? null
      : null;
  const wikipediaUrlPromise: Promise<string | null> = directWikiUrl
    ? Promise.resolve(directWikiUrl)
    : wikidataUrl
      ? getWikidataEnWikipediaUrl(wikidataUrl).catch(() => null)
      : Promise.resolve(null);

  const [cbReviews, wikipediaUrl, cbConnected] = await Promise.all([
    canRead
      ? getReleaseGroupReviews(mbid).catch(() => [] as CritiqueBrainzReview[])
      : Promise.resolve([] as CritiqueBrainzReview[]),
    canRead ? wikipediaUrlPromise : Promise.resolve(null),
    canWrite ? hasCbConnection() : Promise.resolve(false),
  ]);
  const reception = wikipediaUrl
    ? await getCriticalReception(wikipediaUrl).catch(() => null)
    : null;

  // Render the section when there's anything to show: existing
  // reviews, the Wikipedia fallback, OR the write-review affordance
  // for users who have it enabled (so an album with zero reviews
  // still surfaces the "write the first one" entry point).
  if (cbReviews.length === 0 && !reception && !canWrite) return null;

  return (
    <section>
      <h2 className="mb-4 text-sm font-semibold tracking-wide uppercase">
        Reviews
      </h2>
      {/* Wikipedia "Critical reception" first — it's an editorial
          critic-consensus summary that frames the album, so it makes
          sense as the lead. CB user reviews follow as the live peer-
          rating signal. Both render when available; either alone is
          fine too. */}
      {reception && <WikipediaReception reception={reception} />}
      {cbReviews.length > 0 && (
        <div className={reception ? "mt-3" : undefined}>
          <CritiqueBrainzReviews reviews={cbReviews} />
        </div>
      )}
      {canWrite && <WriteReviewForm mbid={mbid} connected={cbConnected} />}
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
      {/*
       * `reception.html` is sanitized server-side in
       * `sanitizeReceptionHtml` — only `<a>` (with vetted absolute
       * Wikipedia/external href + noopener), `<p>`, `<br>`, and a
       * narrow set of inline emphasis tags survive. No script/style
       * tags reach this point. `prose-a` styling preserves the
       * Wikipedia inline links from being invisible against the
       * surrounding text.
       */}
      <div
        className="text-foreground max-w-3xl text-sm leading-7 [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:opacity-80 [&_p]:mb-3 [&_p:last-child]:mb-0"
        dangerouslySetInnerHTML={{ __html: reception.html }}
      />
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
