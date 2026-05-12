/**
 * @username parsing for pin comments + similar free-text surfaces.
 *
 * MusicBrainz usernames are case-insensitive case-preserving and
 * accept `[A-Za-z0-9._-]` (per MB's signup form constraints). The
 * regex below mirrors that character class with a word-boundary
 * leading guard so `foo@bar.com` doesn't tokenise as a mention.
 *
 * Returned segments are plain data — the renderer wraps `mention`
 * segments in a `<Link>` to the user's profile and leaves `text`
 * segments as-is. No HTML, no string concat into a sanitiser.
 */

export type MentionSegment =
  | { kind: "text"; value: string }
  | { kind: "mention"; name: string };

/**
 * Capture-group 1 = the username without the leading `@`. The
 * preceding character is the regex's own boundary (start-of-input
 * or non-word) — not captured. MB usernames are 1-64 chars; we
 * cap at 64 below to avoid pathological matches on long URLs that
 * happen to start with `@`.
 *
 * `g` flag for repeated `exec` walking.
 */
const MENTION_RE = /(?:^|(?<=[\s.,!?;:()[\]{}<>"']))@([A-Za-z0-9._-]{1,64})/g;

/**
 * Tokenise text into alternating plain-text + mention segments.
 * Renderer maps over the result — text segments render as-is,
 * mention segments render as a `<Link>` to `/user/<name>`.
 */
export function parseMentions(text: string): MentionSegment[] {
  if (!text) return [];
  const out: MentionSegment[] = [];
  let lastIndex = 0;
  // Fresh RegExp instance — global regexes carry mutable lastIndex
  // state across calls if the imported constant is reused.
  const re = new RegExp(MENTION_RE.source, MENTION_RE.flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      out.push({ kind: "text", value: text.slice(lastIndex, match.index) });
    }
    out.push({ kind: "mention", name: match[1] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    out.push({ kind: "text", value: text.slice(lastIndex) });
  }
  return out;
}

/**
 * Extract the unique set of lower-cased usernames mentioned in
 * `text`. Used by the mention-index writer to know which user
 * keys to fan-out into.
 *
 * Lower-cased because MB usernames are case-insensitive on
 * lookup; the index keys off the same lower-cased form the
 * `bsky-link:<name>` and `flag:<name>:users` stores do.
 */
export function extractMentions(text: string): string[] {
  const set = new Set<string>();
  for (const seg of parseMentions(text)) {
    if (seg.kind === "mention") set.add(seg.name.toLowerCase());
  }
  return Array.from(set);
}
