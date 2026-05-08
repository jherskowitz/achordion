import { PageShell } from "@/components/achordion/page-shell";
import { PageHeader } from "@/components/achordion/page-header";

export const metadata = { title: "Changelog" };
// See app/(content)/layout.tsx for the static-rendering rationale.
export const revalidate = 86400;

/**
 * Dated entries — one per day Achordion shipped a meaningful batch
 * of user-visible work. Curated, NOT a 1:1 mirror of git log: pick
 * the highlights a regular visitor would notice and group them.
 *
 * Add new days at the TOP of the array as you ship them. Each entry
 * is a short title + a few bullet highlights. Keep it readable, not
 * exhaustive — the goal is "what's actually different for me as a
 * listener now compared to last time I looked," not engineering
 * minutiae.
 */
interface ChangelogEntry {
  /** ISO `YYYY-MM-DD`. Used as the section anchor + display heading. */
  date: string;
  /** Optional one-liner that frames the day's theme. */
  intro?: string;
  /** User-facing highlights. Plain strings — no inline links yet. */
  highlights: string[];
}

const ENTRIES: ChangelogEntry[] = [
  {
    date: "2026-05-08",
    intro:
      "Embeddable widgets, instantly-clickable streaming links, and album-page parity with the track page.",
    highlights: [
      "New embeddable widget for albums at /embed/album/<mbid>, mirroring the track widget. Includes an expandable tracklist where each row has its own external-links pill so listeners can play any specific track.",
      "Track + album pages now paint the streaming favicon row immediately on first load — when a friend shares a link, they can click straight through to Spotify / Apple Music / Bandcamp without waiting for the resolver.",
      "Album page header redesigned to match the track page: cover with hover-play, overflow menu inline with the favicon row, listens / listeners stats stacked top-right, tags below. One consistent shape across entity types.",
      "Top Listeners on track pages now spans the full page width as a card grid (4 columns at xl, 3 at lg) instead of cramped into a sidebar.",
      "Recent Listens on profile pages updates faster — polls every 15s (was 25s) and fires extra polls on focus / typing / clicks so a freshly-played track shows up within seconds.",
      "Stats page now defaults to “Last year” instead of “All time” and section headers read “Top Artists / Top Albums / Top Tracks.”",
      "Listens page (/user/<name>/listens) gets the per-row ⋮ menu for signed-in viewers — love, queue in Parachord, open elsewhere, etc.",
      "Bandcamp favicons now render as the canonical Bandcamp mark even on artist subdomains — consistent across every track / album / artist page.",
      "About page disclosure: documented the recording-to-streaming-link cache as a community-curated open data layer fed by Parachord playback (the “implicit human curation” gap MusicBrainz URL relationships can't fill at scale).",
    ],
  },
  {
    date: "2026-05-07",
    intro: "MB tag voting + a richer feed timeline.",
    highlights: [
      "Tag voting: artist, album, and track pages now let signed-in MusicBrainz users upvote / downvote genre tags directly inside Achordion, with autocomplete against MB's curated genre list.",
      "Loved tracks now appear in /feed alongside pins and reviews, with a red heart icon and the same Hide-my-own filter as everything else.",
      "Fresh Releases overview is a single continuous grid instead of being chopped into per-week buckets.",
      "Recommended artists moved to the sidebar on /explore so the main column leads with Recommended tracks.",
      "Better mobile filter stacking on /explore and /search; the search spinner no longer overlaps the clear-x.",
    ],
  },
  {
    date: "2026-05-06",
    intro: "Feed events expanded + accessibility + touch polish.",
    highlights: [
      "Feed renders all 8 ListenBrainz event types (pins, reviews, recommendations, follows, etc.) with a Thanks button on pins and recommendations.",
      "Touch tap-target sweep across every icon button on the site — affordances grow on coarse pointers so you don't have to aim with a stylus.",
      "App Marketplace reorganised into four clear categories with Scrobblers above Players (most listeners need a scrobbler more urgently).",
      "On-air pill polls adaptively (10s when you're playing, 60s when idle) and fires an extra poll on tab-refocus so it catches up immediately.",
      "Album links across the site now consistently route to the abstract release-group, not a specific edition.",
    ],
  },
  {
    date: "2026-05-05",
    intro: "Per-track action menus everywhere + per-profile Radio widget.",
    highlights: [
      "Per-row ⋮ menu landed across listens, loved, top tracks, feed events, charts, recommendations, and pinned tracks — love, queue in Parachord, copy link, open in MB, delete.",
      "Pinned tracks now stream their full external-links row in via Suspense (Spotify / Apple / Bandcamp / etc.) so the action affordance is right there on the card.",
      "Profile pages get a per-user Stats Radio widget — pick a range, queue that user's top tracks straight into Parachord.",
      "Site header surfaces your own on-air pill alongside the search bar so you can see what you're scrobbling without leaving wherever you are.",
      "“Play in Parachord” + “Save to Parachord” CTAs added to listens / loved / top-tracks list views, with XSPF download as a fallback.",
    ],
  },
  {
    date: "2026-05-04",
    intro: "Design system, performance, and pre-launch polish.",
    highlights: [
      "Public entity pages (artist / album / track / tag / charts) are now edge-cached for an hour with stale-while-revalidate — repeat visits feel instant.",
      "Mobile navigation drawer on small screens — every top-level link, search, settings, and theme toggle now reachable below the md breakpoint.",
      "FAQ page added covering the common “how do I get my listens in” / “edit listens” / “what's Parachord” questions.",
      "Accessibility pass: persistent underlines on inline links, heading-order fixes, contrast bumps on subdued text.",
      "DESIGN.md visual-grammar canon shipped to keep new surfaces consistent.",
      "Pre-launch metadata: dynamic OG image, sitemap, fuller robots.txt.",
    ],
  },
  {
    date: "2026-05-03",
    intro: "Charts, branding, and welcome flow.",
    highlights: [
      "New top-level Charts surface with ListenBrainz sitewide top albums + tracks, Apple Music charts, and the NACC US college-radio Top 30.",
      "Welcome wizard step 3 shows a Parachord install pitch with the protocol-handler explainer for the parachord:// deep links across the site.",
      "Playlist editing matches LB's name / description / public / collaborators dialog, with typeahead for adding collaborators and a private-mode toggle that hides the playlist from non-owners.",
      "Wordmark + favicon refresh.",
      "About + Donate pages rebuilt with the project's full pitch and clearer attribution to the MetaBrainz Foundation.",
      "Search typeahead now includes songs (with linked credits), uses popularity sort, and lazy-loads artist images.",
      "Recommendation rails get a Familiarity slider so you can dial each rail between “only stuff you know” and “only stuff you've never heard.”",
    ],
  },
  {
    date: "2026-05-02",
    intro: "Player wiring + first-run wizard + live profile data.",
    highlights: [
      "Every play affordance across the site now hands off to Parachord via a parachord:// deep link — track rows, album covers, chart entries, pinned tracks, feed events.",
      "Welcome wizard introduced on first sign-in to walk new users through connecting a scrobble source, picking display preferences, and installing Parachord.",
      "/radio station builder UI for ListenBrainz Radio prompts (artist / tag / similar-to / similar-users), with /radio rewinds (public-radio scrapes via spinbin) on the same page.",
      "On-air indicators on the user header, profile rows, and feed pinned tracks — including a “Listen along with X in Parachord” button when the viewer isn't the profile owner.",
      "/feed promoted out of the profile sub-nav to a top-level destination with all 8 LB event types.",
      "Profile avatars (DiceBear shapes locked to Parachord brand colours) replace the previous initials placeholders.",
      "/charts gets Apple Music charts as the first chart provider, with daily refresh.",
      "Artist hero pulls a photo from Wikidata when one is available.",
    ],
  },
  {
    date: "2026-05-01",
    intro: "Initial public build — full route skeleton lit up with live data.",
    highlights: [
      "Bootstrap of every primary route: /, /search, /artist/[mbid], /release-group/[mbid], /release/[mbid], /recording/[mbid], /user/[name], /user/[name]/stats, and /user/[name]/charts.",
      "Artist pages get a full discography (filtered to studio releases by default), a Wikipedia bio, popular tracks above the discography, a “Fans also like” section, and an LB Radio CTA tuned to the artist.",
      "Album pages render the full tracklist with hover-play overlays and a sidebar for cover-art + external links.",
      "Live ListenBrainz data on /, /search, /user/<name>, /artist, and the user stats / charts views — listens, loves, top artists / albums / tracks, listening-over-time, daily heatmap.",
      "MIT license, AGENTS.md groundwork, and the first design conventions committed.",
    ],
  },
];

export default function ChangelogPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Changelog"
        title="What's new"
        description="A running summary of the user-visible features + improvements we've shipped, day by day. Most recent at the top."
      />
      <div className="max-w-2xl space-y-12 pb-12">
        {ENTRIES.map((entry) => (
          <section key={entry.date} id={entry.date} className="scroll-mt-24">
            {/* Date acts as the section heading. h2 (not h3) — sibling
                of the page H1 inside <PageHeader>, not nested under
                anything else. */}
            <h2 className="text-foreground mb-3 text-sm font-semibold tracking-wide uppercase">
              <a
                href={`#${entry.date}`}
                className="hover:underline underline-offset-4"
              >
                <time dateTime={entry.date}>{formatDate(entry.date)}</time>
              </a>
            </h2>
            {entry.intro && (
              <p className="text-muted-foreground mb-4 text-base">
                {entry.intro}
              </p>
            )}
            <ul className="text-muted-foreground space-y-2 text-sm leading-6">
              {entry.highlights.map((h, i) => (
                <li
                  key={i}
                  className="relative pl-5 before:absolute before:top-2.5 before:left-1 before:size-1.5 before:rounded-full before:bg-current before:opacity-40"
                >
                  {h}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </PageShell>
  );
}

/** Format an ISO `YYYY-MM-DD` as e.g. `Friday, May 8, 2026`.
 *  Uses UTC + en-US locale for stable output regardless of where the
 *  page is rendered. */
function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
