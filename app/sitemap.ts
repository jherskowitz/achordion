import type { MetadataRoute } from "next";

/**
 * Sitewide sitemap. Lists ONLY the static, public, crawler-eligible
 * pages — `/`, `/about`, `/faq`, `/donate`, `/login`. Catalog routes
 * (`/artist/*`, `/release-group/*`, `/recording/*`, `/user/*`,
 * `/playlist/*`, `/tag/*`) are deliberately omitted because:
 *
 *   1. They're community / personal data and we don't want them
 *      indexed; `app/robots.ts` already disallows them.
 *   2. The set is unbounded — listing every MusicBrainz entity would
 *      defeat the purpose of MusicBrainz being the canonical source.
 *
 * Anyone looking for an artist page should find it on MusicBrainz or
 * via Achordion's own search; we're not trying to win SEO against MB.
 */

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://achordion.xyz";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const pages: Array<{
    path: string;
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
    priority: number;
  }> = [
    { path: "/", changeFrequency: "weekly", priority: 1.0 },
    { path: "/about", changeFrequency: "monthly", priority: 0.8 },
    { path: "/faq", changeFrequency: "monthly", priority: 0.8 },
    { path: "/apps", changeFrequency: "monthly", priority: 0.7 },
    { path: "/donate", changeFrequency: "yearly", priority: 0.5 },
    { path: "/login", changeFrequency: "yearly", priority: 0.4 },
  ];

  return pages.map(({ path, changeFrequency, priority }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }));
}
