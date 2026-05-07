import "server-only";

import { z } from "zod";
import { stripHtml } from "@/lib/strip-html";
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
    const res = await fetch(apiUrl, {
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
    const res = await fetch(apiUrl, {
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
  text: string;
  url: string;
  source: string;
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
    const res = await fetch(sectionsUrl, {
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
    const res = await fetch(sectionUrl, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      next: {
        revalidate: 60 * 60 * 24 * 7,
        tags: [`wiki-reception:${lang}:${title}`],
      },
    });
    if (!res.ok) return null;
    const data = SectionTextResponseSchema.parse(await res.json());
    const html = data.parse?.text ? unwrapSectionText(data.parse.text) : "";
    const plain = stripHtml(html);
    if (!plain) return null;
    const truncated =
      plain.length > MAX_RECEPTION_CHARS
        ? plain.slice(0, MAX_RECEPTION_CHARS).replace(/\s+\S*$/, "") + "…"
        : plain;
    return {
      title: resolvedTitle,
      text: truncated,
      url: pageUrl,
      source: `${lang}.wikipedia.org`,
    };
  } catch {
    return null;
  }
}
