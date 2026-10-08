import type { Metadata } from "next";

/**
 * Copy for the top-level section/tab OG cards, in ONE place so the card
 * image (`app/_og-section.tsx`) and the page metadata (`sectionMetadata`)
 * stay in sync. Pure data — safe to import from both a page (server) and
 * an `opengraph-image.tsx` (next/og sandbox).
 *
 * Why both: `opengraph-image.tsx` makes the og:IMAGE unique, but the root
 * layout's static `openGraph.title = "Achordion"` otherwise leaks to every
 * section (and Meta dedupe-caches it site-wide), so each page must also set
 * its own openGraph/twitter title+description via `sectionMetadata`.
 */
export interface SectionOg {
  /** Uppercase eyebrow on the card (e.g. "Charts · Apple Music"). */
  eyebrow: string;
  /** Big headline on the card + the page <title> / og:title. */
  title: string;
  /** One-line subtitle on the card. */
  subtitle: string;
  /** og:description / twitter description. */
  description: string;
  /** OG image alt text (accessibility + some scrapers show it). */
  alt: string;
}

export const SECTIONS = {
  charts: {
    eyebrow: "Charts",
    title: "What everyone's playing",
    subtitle:
      "Daily and weekly charts from ListenBrainz, Apple Music, and college radio.",
    description:
      "What everyone's playing — daily and weekly charts from ListenBrainz, Apple Music, and college radio.",
    alt: "Charts on Achordion",
  },
  "charts/listenbrainz": {
    eyebrow: "Charts · ListenBrainz",
    title: "ListenBrainz charts",
    subtitle:
      "The most-listened artists, releases, and tracks across ListenBrainz.",
    description:
      "The most-listened artists, releases, and tracks across ListenBrainz.",
    alt: "ListenBrainz charts on Achordion",
  },
  "charts/apple-music": {
    eyebrow: "Charts · Apple Music",
    title: "Apple Music charts",
    subtitle:
      "The most-played albums and songs on Apple Music, by country. Refreshes daily.",
    description:
      "The most-played albums and songs on Apple Music, by country. Refreshes daily.",
    alt: "Apple Music charts on Achordion",
  },
  "charts/college-radio": {
    eyebrow: "Charts · College Radio",
    title: "College radio charts",
    subtitle:
      "What campus and community stations are spinning, by country. NACC weekly Top 30.",
    description:
      "What campus and community radio stations are spinning, by country — the NACC weekly Top 30.",
    alt: "College radio charts on Achordion",
  },
  explore: {
    eyebrow: "Explore",
    title: "Find your music. Find your people.",
    subtitle:
      "Recommendations, fresh releases, critical darlings, and your year in music.",
    description:
      "Find your music and your people — recommendations, fresh releases, critical darlings, and your year in music.",
    alt: "Explore on Achordion",
  },
  "explore/fresh-releases": {
    eyebrow: "Explore · New Releases",
    title: "Fresh Releases",
    subtitle:
      "New albums and singles from the artists you follow and across ListenBrainz.",
    description:
      "New albums and singles from the artists you follow and across ListenBrainz.",
    alt: "Fresh Releases on Achordion",
  },
  "explore/critical-darlings": {
    eyebrow: "Explore · Critical Darlings",
    title: "Critical Darlings",
    subtitle:
      "Top-rated albums from leading music publications, refreshed through the week.",
    description:
      "Top-rated albums from leading music publications, refreshed through the week.",
    alt: "Critical Darlings on Achordion",
  },
  "explore/year-in-music": {
    eyebrow: "Explore · Year in Music",
    title: "Year in Music",
    subtitle:
      "Your listening year, wrapped — top artists, tracks, and new discoveries.",
    description:
      "Your listening year, wrapped — top artists, tracks, and new discoveries.",
    alt: "Year in Music on Achordion",
  },
  "explore/similar-users": {
    eyebrow: "Explore · Similar Users",
    title: "Similar Users",
    subtitle:
      "Listeners whose taste overlaps with yours, computed from listen history.",
    description:
      "Listeners whose taste overlaps with yours, computed from your ListenBrainz listen history.",
    alt: "Similar Users on Achordion",
  },
  "explore/recommended-artists": {
    eyebrow: "Explore · Recommended",
    title: "Recommended Artists",
    subtitle:
      "Artists picked for you from your ListenBrainz listening history.",
    description:
      "Artists picked for you from your ListenBrainz listening history.",
    alt: "Recommended Artists on Achordion",
  },
  "explore/recommended-tracks": {
    eyebrow: "Explore · Recommended",
    title: "Recommended Tracks",
    subtitle:
      "Tracks picked for you from your ListenBrainz listening history.",
    description:
      "Tracks picked for you from your ListenBrainz listening history.",
    alt: "Recommended Tracks on Achordion",
  },
  "explore/weekly-jams": {
    eyebrow: "Explore · Weekly",
    title: "Weekly Jams",
    subtitle:
      "A fresh playlist of familiar favourites, refreshed every week by ListenBrainz.",
    description:
      "A fresh playlist of familiar favourites, refreshed every week by ListenBrainz.",
    alt: "Weekly Jams on Achordion",
  },
  "explore/weekly-exploration": {
    eyebrow: "Explore · Weekly",
    title: "Weekly Exploration",
    subtitle:
      "A fresh playlist of new-to-you music, refreshed every week by ListenBrainz.",
    description:
      "A fresh playlist of new-to-you music, refreshed every week by ListenBrainz.",
    alt: "Weekly Exploration on Achordion",
  },
  radio: {
    eyebrow: "Radio",
    title: "Radio",
    subtitle:
      "ListenBrainz radio stations and curated rewinds, playable in Parachord.",
    description:
      "ListenBrainz radio stations and curated rewinds, playable in Parachord.",
    alt: "Radio on Achordion",
  },
  "radio/rewind": {
    eyebrow: "Radio · Rewinds",
    title: "Radio Rewinds",
    subtitle:
      "Relive what college and community radio was spinning, week by week.",
    description:
      "Relive what college and community radio was spinning, week by week.",
    alt: "Radio Rewinds on Achordion",
  },
  "radio/builder": {
    eyebrow: "Radio · Builder",
    title: "Station Builder",
    subtitle:
      "Build a custom ListenBrainz radio station from artists, tags, or your stats.",
    description:
      "Build a custom ListenBrainz radio station from artists, tags, or your listening stats.",
    alt: "Station Builder on Achordion",
  },
} satisfies Record<string, SectionOg>;

export type SectionKey = keyof typeof SECTIONS;

/**
 * Metadata (title + openGraph + twitter) for a section page. Call from the
 * page's `export const metadata = sectionMetadata("charts/apple-music")`.
 * The colocated `opengraph-image.tsx` supplies the image automatically.
 */
export function sectionMetadata(key: SectionKey): Metadata {
  const s = SECTIONS[key];
  return {
    title: s.title,
    description: s.description,
    openGraph: { title: s.title, description: s.description, type: "website" },
    twitter: {
      card: "summary_large_image",
      title: s.title,
      description: s.description,
    },
  };
}
