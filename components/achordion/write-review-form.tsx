"use client";

import { useActionState, useState } from "react";
import { usePathname } from "next/navigation";
import { AlertCircle, Check, ExternalLink, Star } from "lucide-react";
import {
  submitReviewAction,
  type SubmitReviewState,
} from "@/app/(app)/release-group/[mbid]/actions";
import {
  CB_DEFAULT_LICENSE,
  CB_REVIEW_MAX_CHARS,
  CB_REVIEW_MIN_CHARS,
} from "@/lib/clients/critiquebrainz-constants";

const initial: SubmitReviewState = { status: "idle" };

interface WriteReviewFormProps {
  mbid: string;
  /** Does the viewer have a usable CritiqueBrainz token cookie? When
   *  false, the form swaps the submit affordance for a "Connect
   *  CritiqueBrainz →" link that starts the OAuth flow. */
  connected: boolean;
}

export function WriteReviewForm({ mbid, connected }: WriteReviewFormProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [rating, setRating] = useState<number>(0);
  const [state, formAction, pending] = useActionState(
    submitReviewAction,
    initial,
  );
  const pathname = usePathname() ?? "/";
  const connectHref = `/api/critiquebrainz/connect?return=${encodeURIComponent(
    pathname,
  )}`;

  if (state.status === "success") {
    return (
      <div className="border-border/60 bg-card/30 mt-4 rounded-xl border p-4 text-sm">
        <p className="inline-flex items-center gap-1.5">
          <Check className="size-3.5" />
          Review published.
        </p>
        <a
          href={state.reviewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground mt-2 inline-flex items-center gap-1.5 text-xs"
        >
          <ExternalLink className="size-3" />
          View on CritiqueBrainz
        </a>
      </div>
    );
  }

  if (!open) {
    // Right-aligned trigger that sits flush with the cards' right
    // edge above. Wrapped in a flex row so the button hugs the right
    // gutter of the same bounding box as the review tiles.
    return (
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
        >
          + Write a review
        </button>
      </div>
    );
  }

  const chars = text.length;
  const tooShort = chars < CB_REVIEW_MIN_CHARS;
  const tooLong = chars > CB_REVIEW_MAX_CHARS;

  return (
    <form
      action={formAction}
      className="border-border/60 bg-card/30 mt-4 space-y-3 rounded-xl border p-4"
    >
      <input type="hidden" name="mbid" value={mbid} />
      <input type="hidden" name="rating" value={rating || ""} />

      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor="cb-review-text" className="block text-sm font-medium">
          Write a review
        </label>
        <span
          className={
            tooShort || tooLong
              ? "text-muted-foreground/70 text-xs tabular-nums"
              : "text-foreground text-xs tabular-nums"
          }
        >
          {tooShort
            ? `${CB_REVIEW_MIN_CHARS - chars} more characters to publish`
            : `${chars} / ${CB_REVIEW_MAX_CHARS}`}
        </span>
      </div>

      <textarea
        id="cb-review-text"
        name="text"
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Share your thoughts on this album…"
        className="border-border/60 bg-background placeholder:text-muted-foreground/60 focus:ring-ring/30 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
        required
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <RatingPicker value={rating} onChange={setRating} />
        <p className="text-muted-foreground/70 text-xs">
          Published under {CB_DEFAULT_LICENSE}.
        </p>
      </div>

      {state.status === "error" && (
        <p className="text-destructive inline-flex items-center gap-1.5 text-xs">
          <AlertCircle className="size-3" />
          {state.message}
          {state.reconnect && (
            <a
              href={connectHref}
              className="ml-1 underline underline-offset-4"
            >
              Reconnect
            </a>
          )}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          Cancel
        </button>
        {connected ? (
          <button
            type="submit"
            disabled={pending || tooShort || tooLong}
            className="bg-primary text-primary-foreground inline-flex h-9 items-center justify-center rounded-lg px-4 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Publishing…" : "Publish"}
          </button>
        ) : (
          <a
            href={connectHref}
            className="bg-primary text-primary-foreground inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-medium hover:opacity-90"
          >
            Connect CritiqueBrainz
            <ExternalLink className="size-3.5" />
          </a>
        )}
      </div>
    </form>
  );
}

function RatingPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div
      className="inline-flex items-center gap-1"
      role="radiogroup"
      aria-label="Rating"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          onClick={() => onChange(value === n ? 0 : n)}
          className="text-muted-foreground/40 hover:text-amber-500 focus-visible:outline-ring/50 cursor-pointer rounded-sm p-0.5 focus-visible:outline-2"
        >
          <Star
            className={
              n <= value
                ? "size-5 fill-current text-amber-500"
                : "size-5"
            }
          />
        </button>
      ))}
      {value > 0 && (
        <button
          type="button"
          onClick={() => onChange(0)}
          className="text-muted-foreground hover:text-foreground ml-1 text-xs underline-offset-4 hover:underline"
        >
          Clear
        </button>
      )}
    </div>
  );
}

