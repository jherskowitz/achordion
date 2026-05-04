import type { MetadataRoute } from "next";

/**
 * `/robots.txt` for achordion.xyz.
 *
 * The catalog routes (`/artist/[mbid]`, `/release/[mbid]`, etc.) deep-
 * link into millions of MusicBrainz entities. A crawler walking even a
 * fraction of that is thousands of fan-out calls into MB / ListenBrainz
 * — each MB call serializes behind our 1 req/sec shared rate limit, so
 * crawler traffic on these routes stacks real-user requests in the same
 * queue and pegs page latency for everyone.
 *
 * Posture:
 *   - Block AI training crawlers entirely. They produce no SEO value
 *     and they're the most aggressive walkers right now.
 *   - Allow legitimate search crawlers (Googlebot, Bingbot etc) but
 *     keep them off the catalog-explosion routes — they can index the
 *     curated surfaces (home, /about, /charts, /explore tabs) where
 *     the discovery story actually lives.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // AI training scrapers — out entirely. None of these honor robots
      // perfectly, but most do for the pages they care about.
      {
        userAgent: [
          "GPTBot",
          "ChatGPT-User",
          "OAI-SearchBot",
          "ClaudeBot",
          "Claude-Web",
          "anthropic-ai",
          "CCBot",
          "PerplexityBot",
          "Google-Extended",
          "Applebot-Extended",
          "Bytespider",
          "Amazonbot",
          "FacebookBot",
          "Meta-ExternalAgent",
          "DuckAssistBot",
          "Diffbot",
        ],
        disallow: "/",
      },
      // Generic crawlers — restrict to the curated surfaces. The
      // catalog routes proxy upstream MB/LB calls and aren't worth
      // indexing exhaustively (the canonical pages live at
      // musicbrainz.org / listenbrainz.org anyway).
      {
        userAgent: "*",
        disallow: [
          "/artist/",
          "/release/",
          "/release-group/",
          "/recording/",
          "/tag/",
          "/playlist/",
          "/user/",
          "/api/",
        ],
      },
    ],
    host: "https://achordion.xyz",
  };
}
