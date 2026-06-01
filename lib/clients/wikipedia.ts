import "server-only";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

import { z } from "zod";
import type { ArtistExternalLink } from "./musicbrainz";

const USER_AGENT = "Achordion/0.1 (jherskow@gmail.com)";

const SummarySchema = z
  .object({
    title: z.string(),
    extract: z.string().optional(),
    description: z.string().optional(),
    content_urls: z
      .object({
        desktop: z.object({ page: z.string() }).partial().optional(),
      })
      .partial()
      .optional(),
  })
  .passthrough();

export interface WikipediaBio {
  title: string;
  extract: string;
  url: string;
  source: string;
}

interface BioSource {
  kind: "wikipedia" | "wikidata";
  url: string;
}

/**
 * Pick the best biography source from MB url-rels.
 * Prefers a direct Wikipedia link (English first), falls back to Wikidata.
 */
export function findBioSource(
  links: ArtistExternalLink[],
): BioSource | null {
  const wikis = links.filter((l) => /\.wikipedia\.org\//.test(l.url));
  const en = wikis.find((l) => l.url.includes("en.wikipedia.org"));
  if (en) return { kind: "wikipedia", url: en.url };
  if (wikis[0]) return { kind: "wikipedia", url: wikis[0].url };
  const wikidata = links.find((l) => /\bwikidata\.org\//.test(l.url));
  if (wikidata) return { kind: "wikidata", url: wikidata.url };
  return null;
}

async function fetchWikipediaSummary(
  pageUrl: string,
): Promise<WikipediaBio | null> {
  let title: string;
  let lang: string;
  try {
    const u = new URL(pageUrl);
    if (!u.hostname.endsWith("wikipedia.org")) return null;
    lang = u.hostname.split(".")[0] || "en";
    title = decodeURIComponent(u.pathname.replace(/^\/wiki\//, ""));
    if (!title) return null;
  } catch {
    return null;
  }

  const apiUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
    title,
  )}`;

  try {
    const res = await fetchWithTimeout(apiUrl, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      next: {
        revalidate: 60 * 60 * 24 * 7,
        tags: [`wiki:${lang}:${title}`],
      },
    });
    if (!res.ok) return null;
    const data = SummarySchema.parse(await res.json());
    if (!data.extract) return null;
    return {
      title: data.title,
      extract: data.extract,
      url: data.content_urls?.desktop?.page ?? pageUrl,
      source: `${lang}.wikipedia.org`,
    };
  } catch {
    return null;
  }
}

const WikidataResponseSchema = z
  .object({
    entities: z.record(
      z.string(),
      z
        .object({
          sitelinks: z.record(z.string(), z.object({ url: z.string() }).passthrough()).optional(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const WIKI_LANG_PREFERENCE = ["enwiki", "dewiki", "frwiki", "eswiki", "itwiki"];

async function resolveWikidataToWikipedia(
  wikidataUrl: string,
): Promise<string | null> {
  const m = wikidataUrl.match(/\/(?:wiki|entity)\/(Q\d+)/);
  if (!m) return null;
  const qid = m[1];
  const sites = WIKI_LANG_PREFERENCE.join("|");
  const apiUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=sitelinks%2Furls&sitefilter=${sites}&format=json&origin=*`;
  try {
    const res = await fetchWithTimeout(apiUrl, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      next: {
        revalidate: 60 * 60 * 24 * 30,
        tags: [`wikidata:${qid}`],
      },
    });
    if (!res.ok) return null;
    const data = WikidataResponseSchema.parse(await res.json());
    const sitelinks = data.entities[qid]?.sitelinks ?? {};
    for (const site of WIKI_LANG_PREFERENCE) {
      if (sitelinks[site]?.url) return sitelinks[site].url;
    }
    return null;
  } catch {
    return null;
  }
}

export async function getBiography(
  source: BioSource,
): Promise<WikipediaBio | null> {
  if (source.kind === "wikipedia") {
    return fetchWikipediaSummary(source.url);
  }
  const wikipediaUrl = await resolveWikidataToWikipedia(source.url);
  if (!wikipediaUrl) return null;
  return fetchWikipediaSummary(wikipediaUrl);
}

// ─── Critical reception section extraction ──────────────────────────
//
// Wikipedia album pages conventionally include a "Critical reception"
// (sometimes "Reception") section summarising reviews from major
// publications. Pulling it gives us a much broader editorial-coverage
// fallback for albums that CritiqueBrainz hasn't gotten to yet.
//
// The MediaWiki Action API exposes this in two calls:
//   1. action=parse&prop=sections    → list of sections + indices
//   2. action=parse&section=<index>&prop=text → HTML of that section
//
// We strip HTML and trim to a reasonable preview length; the full
// page link lets readers drill in if they want the citations.

const SectionsResponseSchema = z
  .object({
    parse: z
      .object({
        title: z.string().optional(),
        sections: z
          .array(
            z
              .object({
                line: z.string().optional(),
                index: z.string().optional(),
                level: z.string().optional(),
              })
              .passthrough(),
          )
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const SectionTextResponseSchema = z
  .object({
    parse: z
      .object({
        text: z.union([
          z.string(),
          z.object({ "*": z.string() }).passthrough(),
        ]),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const RECEPTION_RE = /^(critical reception|reception|critical response)$/i;
const MAX_RECEPTION_CHARS = 1200;

export interface WikipediaCriticalReception {
  title: string;
  /**
   * Sanitized HTML of the Critical reception preview. Allowed tags
   * are whitelisted in `sanitizeReceptionHtml`: `<a>` (href only,
   * absolute URL), `<i>`, `<em>`, `<b>`, `<strong>`. Safe to render
   * via `dangerouslySetInnerHTML` — every href is normalized to a
   * vetted Wikipedia or external URL, and no other tags survive the
   * pipeline. Inline footnote markers like `<sup class="reference">`,
   * the `<table>` ratings infobox, and `[edit]` section anchors are
   * all dropped before sanitization.
   */
  html: string;
  url: string;
  source: string;
}

/**
 * Convert the raw HTML of a Wikipedia "Critical reception" section
 * into an inline-safe HTML preview that preserves prose links. We
 * keep `<a>` so users can click through to "Metacritic", "AllMusic",
 * "Pitchfork" etc. directly from the preview without navigating to
 * Wikipedia first; everything else (the ratings infobox table, edit
 * anchors, footnote `[1]` references, structural divs) gets stripped
 * to plain text.
 *
 * Truncation honors a visible-char budget rather than a raw-string
 * one, so an `<a>` whose visible text crosses the limit doesn't
 * leave a half-open tag in the output.
 */
function sanitizeReceptionHtml(rawHtml: string, lang: string): string {
  // Drop leading section heading (`<h2>Critical reception<span class="mw-editsection">...</span></h2>`)
  // — we render our own "Critical reception" label above the body, so
  // the inline duplicate would otherwise appear as the first line.
  // Tables (the ratings infobox), reference superscripts, and inline
  // <style>/<script> tags also get pre-stripped here since each has
  // a clean open/close at the same depth and no risk of nesting
  // surprises (unlike `<span class="mw-editsection">` which contains
  // bracket spans we have to balance properly — handled in the walker).
  const preStripped = rawHtml
    .replace(/<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/gi, " ")
    .replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, " ")
    .replace(/<sup\b[^>]*class="[^"]*\breference\b[^"]*"[^>]*>[\s\S]*?<\/sup>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ");

  // Allowed inline tags. `<a>` is special-cased below to sanitize
  // href; `<br>` is void (self-closing), and `<p>` wraps block-level
  // paragraphs — keeping both preserves the page's natural line and
  // paragraph breaks instead of mashing the prose into one wall.
  const INLINE_TAGS = new Set(["i", "em", "b", "strong", "p"]);
  const VOID_TAGS = new Set(["br"]);

  // Tokenize into tag / text segments. Walk token-by-token so we can
  // (a) whitelist tags, (b) track open `<a>` for proper close, and
  // (c) stop at a visible-char budget without leaving open tags.
  const tokenRe = /(<[^>]+>)|([^<]+)/g;
  type OpenTag = "a" | "i" | "em" | "b" | "strong" | "p";
  const open: OpenTag[] = [];
  let visible = 0;
  let out = "";
  let truncated = false;

  // When we enter a `<span class="mw-editsection">`, the structure is
  //   <span class="mw-editsection">
  //     <span class="mw-editsection-bracket">[</span>
  //     <a href="...">edit</a>
  //     <span class="mw-editsection-bracket">]</span>
  //   </span>
  // The inner `<a>` is whitelisted by the walker, so without explicit
  // skip tracking the literal "edit" link would survive. Track open
  // <span> count from when we hit the editsection open until that
  // span balance closes — suppress emit while skip > 0.
  let skipSpanDepth = 0;

  for (const m of preStripped.matchAll(tokenRe)) {
    if (truncated) break;
    const tag = m[1];
    const text = m[2];
    if (tag) {
      const close = /^<\s*\//.test(tag);
      const nameMatch = tag.match(/<\s*\/?\s*([a-z][a-z0-9]*)/i);
      const name = nameMatch?.[1]?.toLowerCase() ?? "";
      if (skipSpanDepth > 0) {
        if (name === "span") {
          if (close) skipSpanDepth--;
          else skipSpanDepth++;
        }
        continue;
      }
      if (
        !close &&
        name === "span" &&
        /\bclass\s*=\s*("[^"]*\bmw-editsection\b|'[^']*\bmw-editsection\b)/i.test(
          tag,
        )
      ) {
        skipSpanDepth = 1;
        continue;
      }
      if (close) {
        if (name === "a" || INLINE_TAGS.has(name)) {
          // Only emit a closer if we have a matching opener at the
          // top of the stack (prevents stray closers from corrupting
          // the structure).
          const idx = open.lastIndexOf(name as OpenTag);
          if (idx !== -1) {
            // Close any tags above the match too (defensive — Wikipedia
            // output is usually well-formed but better to over-close).
            for (let i = open.length - 1; i >= idx; i--) {
              out += `</${open[i]}>`;
            }
            open.splice(idx);
          }
        }
        continue;
      }
      if (name === "a") {
        const hrefMatch = tag.match(/\bhref\s*=\s*"([^"]*)"|\bhref\s*=\s*'([^']*)'/i);
        const rawHref = hrefMatch?.[1] ?? hrefMatch?.[2] ?? "";
        const href = resolveWikipediaHref(rawHref, lang);
        if (!href) continue; // Drop unsafe href — keep inner text.
        out += `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">`;
        open.push("a");
        continue;
      }
      if (INLINE_TAGS.has(name)) {
        out += `<${name}>`;
        open.push(name as OpenTag);
        continue;
      }
      if (VOID_TAGS.has(name)) {
        out += `<${name}>`;
        continue;
      }
      // Unknown / disallowed tag: drop it (visible text inside still
      // gets emitted by the next `text` token).
      continue;
    }
    if (text) {
      if (skipSpanDepth > 0) continue;
      const decoded = decodeEntities(text);
      const cleaned = decoded.replace(/\[\s*edit\s*\]/gi, "");
      if (!cleaned) continue;
      // Visible-char accounting against the preview budget.
      const remaining = MAX_RECEPTION_CHARS - visible;
      if (cleaned.length <= remaining) {
        out += escapeText(cleaned);
        visible += cleaned.length;
      } else {
        // Truncate at a word boundary, append the ellipsis, and stop.
        const slice = cleaned.slice(0, remaining).replace(/\s+\S*$/, "");
        out += escapeText(slice) + "…";
        visible += slice.length + 1;
        truncated = true;
      }
    }
  }

  // Close any tags still open at end of input / at truncation.
  for (let i = open.length - 1; i >= 0; i--) {
    out += `</${open[i]}>`;
  }

  // Collapse whitespace runs that the table/edit removals leave behind.
  return out.replace(/\s{2,}/g, " ").trim();
}

function resolveWikipediaHref(href: string, lang: string): string | null {
  if (!href) return null;
  // Bare fragments and javascript: hrefs are dropped — citation
  // anchors (`#cite_note-1`) point to a list we strip anyway.
  if (href.startsWith("#")) return null;
  if (/^\s*javascript:/i.test(href)) return null;
  if (href.startsWith("//")) return `https:${href}`;
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith("/")) return `https://${lang}.wikipedia.org${href}`;
  return null;
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function parseWikipediaUrl(
  pageUrl: string,
): { lang: string; title: string } | null {
  try {
    const u = new URL(pageUrl);
    if (!u.hostname.endsWith("wikipedia.org")) return null;
    const lang = u.hostname.split(".")[0] || "en";
    const title = decodeURIComponent(u.pathname.replace(/^\/wiki\//, ""));
    if (!title) return null;
    return { lang, title };
  } catch {
    return null;
  }
}

function unwrapSectionText(
  text: string | { "*": string },
): string {
  return typeof text === "string" ? text : text["*"];
}

/**
 * Decode the small set of HTML entities Wikipedia routinely emits in
 * its parsed-section output. Specifically: numeric entities (`&#39;`,
 * `&#91;`, `&#93;`) plus the named ones (`&amp;`, `&lt;`, `&gt;`,
 * `&quot;`, `&apos;`, `&nbsp;`). Anything else passes through — we
 * don't need a full entities table for prose, and the few exotic
 * ones (`&hellip;` etc.) Wikipedia mostly emits as literal characters.
 */
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number.parseInt(n, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
      const code = Number.parseInt(n, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * Find a Wikipedia URL for an album from its MB url-rels (release-
 * group or release relations). Prefers en.wikipedia.org so the
 * "Critical reception" heading match is reliable.
 */
export function findAlbumWikipediaUrl(
  links: ArtistExternalLink[],
): string | null {
  const wikis = links.filter((l) => /\.wikipedia\.org\//.test(l.url));
  const en = wikis.find((l) => l.url.includes("en.wikipedia.org"));
  return en?.url ?? wikis[0]?.url ?? null;
}

/**
 * Fetch and extract the "Critical reception" section of an album's
 * Wikipedia page. Returns null when the page has no such section,
 * the page can't be resolved, or the API errors. Section text is
 * truncated to ~1200 chars so the album page renders a preview, with
 * a link to the full Wikipedia page for the citations.
 */
export async function getCriticalReception(
  pageUrl: string,
): Promise<WikipediaCriticalReception | null> {
  const parsed = parseWikipediaUrl(pageUrl);
  if (!parsed) return null;
  const { lang, title } = parsed;

  const sectionsUrl =
    `https://${lang}.wikipedia.org/w/api.php` +
    `?action=parse&page=${encodeURIComponent(title)}` +
    `&prop=sections&format=json&origin=*`;

  let sectionIndex: string | null = null;
  let resolvedTitle = title;
  try {
    const res = await fetchWithTimeout(sectionsUrl, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      next: {
        revalidate: 60 * 60 * 24 * 7,
        tags: [`wiki-reception:${lang}:${title}`],
      },
    });
    if (!res.ok) return null;
    const data = SectionsResponseSchema.parse(await res.json());
    if (data.parse?.title) resolvedTitle = data.parse.title;
    const match = data.parse?.sections?.find((s) =>
      s.line ? RECEPTION_RE.test(s.line.trim()) : false,
    );
    if (!match?.index) return null;
    sectionIndex = match.index;
  } catch {
    return null;
  }

  const sectionUrl =
    `https://${lang}.wikipedia.org/w/api.php` +
    `?action=parse&page=${encodeURIComponent(title)}` +
    `&section=${encodeURIComponent(sectionIndex)}` +
    `&prop=text&format=json&origin=*`;

  try {
    const res = await fetchWithTimeout(sectionUrl, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      next: {
        revalidate: 60 * 60 * 24 * 7,
        tags: [`wiki-reception:${lang}:${title}`],
      },
    });
    if (!res.ok) return null;
    const data = SectionTextResponseSchema.parse(await res.json());
    const html = data.parse?.text ? unwrapSectionText(data.parse.text) : "";
    if (!html) return null;
    const sanitized = sanitizeReceptionHtml(html, lang);
    if (!sanitized) return null;
    return {
      title: resolvedTitle,
      html: sanitized,
      url: pageUrl,
      source: `${lang}.wikipedia.org`,
    };
  } catch {
    return null;
  }
}
