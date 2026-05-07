"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Star } from "lucide-react";
import type { CritiqueBrainzReview } from "@/lib/clients/critiquebrainz";
import type { WikipediaCriticalReception } from "@/lib/clients/wikipedia";
import { stripHtml } from "@/lib/strip-html";
import { safeHttpUrl } from "./external-links";
import { WriteReviewForm } from "./write-review-form";

/**
 * Client island for the album Reviews section.
 *
 * Why a client island: `/release-group/[mbid]` is edge-cached
 * (CDN-Cache-Control: public, s-maxage=3600) and identical across all
 * visitors. Reviews are gated by per-user feature flags + read the
 * session cookie — incompatible with a shared edge cache. The page
 * stays cached; this component fetches the per-user payload after
 * hydration via `/api/release-group/[mbid]/reviews`.
 *
 * Same pattern can be reused for any auth-gated section on a CDN-
 * cached route: ship a server-rendered page (cacheable + fast first
 * paint), drop a client island where personalized content goes,
 * fetch from a `Cache-Control: private, no-store` JSON endpoint.
 */

const SNIPPET_CHARS = 480;

interface ReviewsPayload {
  canRead: boolean;
  canWrite: boolean;
  cbConnected: boolean;
  cbReviews: CritiqueBrainzReview[];
  reception: WikipediaCriticalReception | null;
}

export function AlbumReviewsClient({ mbid }: { mbid: string }) {
  const { data, error, isLoading } = useQuery<ReviewsPayload>({
    queryKey: ["release-group-reviews", mbid],
    queryFn: async () => {
      const url = `/api/release-group/${encodeURIComponent(mbid)}/reviews`;
      const r = await fetch(url, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`reviews ${r.status}`);
      return r.json();
    },
    // Reviews shift slowly — once loaded, treat the response as good
    // for the rest of the session. Stale-while-revalidate is too
    // chatty for sparse data; cheap to mount-fresh on next visit.
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });

  // Render nothing on hard failure — a missing reviews block is
  // strictly better than a broken-state pseudo-card.
  if (error) return null;

  // Render nothing while loading. The section may turn out to be
  // empty (no flags, no CB reviews, no Wikipedia preview) and we'd
  // rather pop the header in only when there's content to show
  // than tease "Reviews" with a skeleton that resolves to nothing.
  // The page already has plenty of above/below content so the
  // delayed pop-in doesn't create a perceived load gap.
  if (isLoading || !data) return null;

  const { canWrite, cbConnected, cbReviews, reception } = data;

  // No reviews, no Wikipedia preview, and no write affordance — render
  // nothing. Sparse coverage is the norm; an empty Reviews header
  // looks worse than a missing section.
  if (cbReviews.length === 0 && !reception && !canWrite) return null;

  return (
    <section>
      <h2 className="mb-4 text-sm font-semibold tracking-wide uppercase">
        Reviews
      </h2>
      {/* Wikipedia "Critical reception" first — editorial critic-
          consensus framing leads, peer ratings follow. */}
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
          <div className="text-muted-foreground mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
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
      {/* `reception.html` is sanitized server-side in
          `sanitizeReceptionHtml` — only `<a>` (with vetted absolute
          href + noopener), `<p>`, `<br>`, and a narrow set of inline
          emphasis tags survive. Safe under `dangerouslySetInnerHTML`. */}
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
