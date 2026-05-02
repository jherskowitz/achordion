import "server-only";

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
