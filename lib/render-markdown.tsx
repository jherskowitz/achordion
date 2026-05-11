import { Fragment, type ReactNode } from "react";

/**
 * Minimal markdown renderer for CritiqueBrainz review bodies.
 *
 * Supports the subset of CommonMark CB reviews actually use:
 *
 *   - `[text](https://url)`        — inline link
 *   - `**bold**`                    — strong
 *   - `*italic*` / `_italic_`       — emphasis
 *   - blank-line paragraph breaks   — split into `<p>` per paragraph
 *
 * Everything else is rendered as plain text (headings, lists, code
 * fences, raw HTML, footnotes, etc.). The reviews-on-album surface
 * is a snippet, not a full markdown viewer — keeping the renderer
 * tight avoids pulling in a 60kb dependency for what 99% of CB
 * reviews ship as.
 *
 * URLs in `[text](url)` MUST be `http://` or `https://`. Anything
 * else (mailto, javascript, custom schemes) is treated as plain
 * text — safer default than rendering an `<a>` to an unknown URL
 * scheme on untrusted content. No HTML strings, no
 * `dangerouslySetInnerHTML` — every output is a React element, so
 * XSS via injected tags is structurally impossible.
 *
 * Returns React elements rather than an HTML string so the caller
 * can apply Tailwind classes to the anchor (and so any future
 * editor changes to text styling don't require touching a sanitiser).
 */

/**
 * Master inline regex. Order matters — links come first because
 * they're most specific (the `]` boundary makes mis-matches
 * unlikely). Bold (`**...**`) is matched before italic (`*...*`)
 * so a `**bold**` doesn't tokenise as `* (italic *bold) *`.
 *
 * Capture groups:
 *   1 = link text       (when present)
 *   2 = link url        (when present)
 *   3 = bold inner text
 *   4 = italic-star inner
 *   5 = italic-underscore inner
 */
const INLINE_TOKEN_RE =
  /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|\*\*((?:[^*\n]|\*(?!\*))+)\*\*|\*([^*\n]+)\*|_([^_\n]+)_/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let lastIndex = 0;
  let i = 0;
  // Fresh RegExp per call — global regexes hold mutable `lastIndex`
  // state across calls if reused, and that's exactly the bug class
  // we don't want in a render path.
  const re = new RegExp(INLINE_TOKEN_RE.source, INLINE_TOKEN_RE.flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      out.push(
        <Fragment key={`${keyPrefix}-t${i++}`}>
          {text.slice(lastIndex, match.index)}
        </Fragment>,
      );
    }
    if (match[1] !== undefined && match[2] !== undefined) {
      // Inline link. `target="_blank"` so the album page stays in
      // the user's tab when they click a citation, and `rel`
      // hardened against the standard reverse-tabnabbing /
      // referrer-leak concerns.
      out.push(
        <a
          key={`${keyPrefix}-l${i++}`}
          href={match[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground underline underline-offset-2 hover:opacity-80"
        >
          {match[1]}
        </a>,
      );
    } else if (match[3] !== undefined) {
      out.push(
        <strong key={`${keyPrefix}-b${i++}`}>{match[3]}</strong>,
      );
    } else if (match[4] !== undefined) {
      out.push(<em key={`${keyPrefix}-i${i++}`}>{match[4]}</em>);
    } else if (match[5] !== undefined) {
      out.push(<em key={`${keyPrefix}-u${i++}`}>{match[5]}</em>);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    out.push(
      <Fragment key={`${keyPrefix}-t${i++}`}>
        {text.slice(lastIndex)}
      </Fragment>,
    );
  }
  return out;
}

/**
 * Render `text` as React nodes — paragraphs split on blank lines,
 * inline markdown rendered per the subset above. Use directly
 * inside a `<div>` or similar block container (each paragraph is
 * its own `<p>` so the wrapper doesn't need to be one).
 */
export function renderReviewMarkdown(text: string): ReactNode[] {
  // CB reviews come back with `\r\n` and `\n` line breaks mixed.
  // Normalise so the paragraph split is deterministic.
  const normalised = text.replace(/\r\n?/g, "\n").trim();
  if (!normalised) return [];
  // Two-or-more newlines → paragraph break. Single newline inside a
  // paragraph collapses to a space (CommonMark default).
  const paragraphs = normalised.split(/\n{2,}/);
  return paragraphs.map((p, idx) => (
    <p key={`p${idx}`} className={idx > 0 ? "mt-3" : undefined}>
      {renderInline(p.replace(/\n/g, " "), `p${idx}`)}
    </p>
  ));
}
