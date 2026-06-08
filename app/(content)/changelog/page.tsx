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
    date: "2026-06-05",
    intro:
      "A site-wide speed and reliability pass — pages paint sooner, stay fresh longer, and a slow or overloaded data source no longer takes a page down with an error.",
    highlights: [
      "Entity pages (artist / album / track / charts) now paint the header first and stream the rest of the page in behind it, and they stay edge-cached for 6 hours instead of 1 — so the next time you or anyone else opens a page, it loads basically instantly. Listener counts and other stats load off the main render path, so the page content shows up without waiting on them.",
      "Cover art no longer flashes an empty frame while it loads — the placeholder now sits behind the image and the artwork fades in over it, and a transient hiccup fetching a cover retries once instead of leaving a blank tile.",
      "Long lists of tracks only fetch the covers for the rows actually on screen (and cap how many load at once), so listen / loved / chart pages scroll smoothly instead of hammering the network the moment they open.",
      "When MusicBrainz, ListenBrainz, or the streaming-link resolver is slow or rate-limiting us, pages now degrade gracefully instead of erroring — every outbound call has a timeout and a deadline, we honour “Retry-After” and back off, and a blip in our own rate limiter fails open rather than taking the whole site down. The net effect for you: far fewer of the occasional 500 / 503 / 504 pages that used to appear when an upstream service had a bad moment.",
    ],
  },
  {
    date: "2026-05-26",
    intro:
      "When the Parachord desktop app is running, Play opens it instantly — no browser round-trip.",
    highlights: [
      "On desktop, if the Parachord app is open and connected, every Play / Open in Parachord / Listen along link across Achordion now hands straight off to the running app the moment you click it — no new tab, no parachord.com round-trip, and the page you're on stays put. If the app isn't running, the same link falls back to the parachord.com page exactly as before.",
      "Sharing is unaffected: copy-link, middle-click, and Cmd/Ctrl-click all still use the clean https://parachord.com/… URL, so what you hand to someone else is always the universally-openable form that works whether or not they have the app.",
    ],
  },
  {
    date: "2026-05-21",
    intro:
      "Mobile Play buttons now Just Work — every Parachord hand-off uses Universal Links / App Links instead of the custom scheme, so installed users tap straight into the app and non-installed users land on a useful page instead of an OS error.",
    highlights: [
      "Every Play / Open in Parachord / Listen along link across Achordion (track rows, album covers, chart entries, Critical Darlings, Radio Rewinds, friend's-pin embeds, the welcome demo, the on-air pill) now emits https://parachord.com/<verb> URLs. Installed Parachord-mobile users (iOS + Android with verified App Links) open the app directly; non-installed users land on a parachord.com pitch page that preserves the destination context — no more OS-level 'Cannot Open Page' alert.",
      "Same URLs shared in Slack, Discord, iMessage, or pasted in a tweet now render a clean preview card from parachord.com instead of raw 'parachord://...' text — way nicer to share.",
      "Custom-scheme parachord:// URLs still work for any contexts that don't go through a browser (in-app webviews, OAuth callbacks, native share intents). Both forms route to the same Parachord-side handler.",
    ],
  },
  {
    date: "2026-05-18",
    intro:
      "Playlist pages get a real second life — a browsable playlists tab with filter, sort, and inline edit; mirror links from Parachord; exact stats; and two new kinds of activity events: 'listened along with' and 'published a playlist'.",
    highlights: [
      "Playlists tab on every profile is now a full browser. Search-as-you-type filter, sort by Modified / Created / Title, lazy-loaded 2×2 cover mosaics that stream in as you scroll, Load more to walk past the first hundred entries, and (on your own profile) a Public / Private / All pill so you can scope the list down. Mosaic covers come from a tagged cache so revisiting feels instant.",
      "Inline Public/Private toggle on every playlist card on your own profile — flip visibility from the row without opening each playlist. Each card is now its own click target with a stretched-link pattern, so the toggle pill captures its clicks independently of the navigation.",
      "Delete Playlist in the per-playlist overflow menu (owner-only). Confirmation dialog, then redirects to your Playlists tab.",
      "External links for playlists. When Parachord syncs a playlist to Spotify / Apple Music / wherever, those mirror URLs render as favicon tiles right next to the playlist's overflow menu — same shape as recording and album pages. ListenBrainz links are filtered out (Achordion is already a LB mirror), and Parachord-side updates surface immediately on the page now that the submit endpoint busts the page cache on success.",
      "Radio Rewind station pages picked up the same overflow menu as playlists, so XSPF download / share / open-in-Parachord actions live in the consistent spot.",
      "Distinct-artist chip on profiles now shows the exact lifetime count (e.g. '8.6k artists') instead of capping at '>500 artists'. Reads the dedicated total straight from ListenBrainz's stats payload.",
      "Activity feed picks up two new event kinds — both behind a flag during early rollout: 'X listened along with Y in Parachord' (fires when a viewer with Parachord open clicks the Listen along pill on someone's on-air widget), and 'X published a playlist' (fires when a followed user flips a playlist from private to public). Privacy gate on the playlist event re-checks visibility on render, so a flipped-back playlist quietly drops out.",
      "Pinned songs appear on your profile instantly after you pin. The pin action now busts the right cache slots and refreshes the page in place — no more 'why isn't my new pin showing up' delay across the Overview vs Pins tab.",
      "Open Graph cards across every entity now use the real Achordion wordmark with the tagline stacked beneath it, instead of the prior bullet-and-text row. Profile cards without a linked Bluesky get a colourful DiceBear avatar in the preview; artist cards without a hero photo also get a DiceBear stand-in seeded by the artist MBID — same visual their in-app avatar already uses.",
      "Tag voting on track / album / artist pages: tags you add show up immediately and stay across refreshes (the genres list and the user-tags list now merge into one chip row, instead of the genres list hiding any non-curated tags you added). The vote also busts our cached read of the entity so the new chip appears on the next render rather than a day later.",
      "When ListenBrainz rate-limits us mid-page-load, the page now shows a clear 'ListenBrainz is rate-limiting us' message with retry guidance instead of dumping the raw 429 string. Per-IP rate-limit hits on our own middleware show a styled 'Slow down a sec' page with Try again / Back to home buttons instead of plaintext 'Too Many Requests'.",
      "Profile-tab nav no longer renders a phantom vertical scrollbar on hover (an active-tab underline was protruding 1px past the nav's content box).",
    ],
  },
  {
    date: "2026-05-12",
    intro:
      "Rich preview cards when you share Achordion links anywhere, @mentions in pin comments, and a tidier Settings page.",
    highlights: [
      "Dynamic Open Graph / Twitter cards on every entity. Paste an artist, album, track, playlist, or user URL into Threads / Discord / Slack / Bluesky / Twitter and the preview unfurls a 1200×630 card with the cover art (or avatar), title, and meta — automatically, no setup. Album cards show the cover + title + artist + year; track cards do the same scoped to the recording; artist cards lead with the hero photo and top genre; user cards lead with the avatar + “Currently into” line; playlist cards show a 2×2 mosaic of the first four covers + creator + track count. (Discord and Threads cache previews aggressively — re-sharing an old URL may still show the prior preview until their caches expire.)",
      "@mentions in pin comments. Tag a friend by writing “@username” anywhere in your pin's comment on ListenBrainz — that username renders as a clickable link to their Achordion profile, AND they get the pin in their /feed (alongside pins and loves from your network) with the usual unread-count badge and opt-in browser notification. The mentioned user doesn't need to be following you. Built on existing LB pin data — no extra writes to your scrobbling history, no Achordion-side scratchpad.",
      "Settings page navigation moved from a side panel to top tabs (Profile / Connections) — same shape as every other page-with-subnav on the site, including on mobile. The own-profile avatar in Settings now also reads from your linked Bluesky account when you have one, matching the rest of the surfaces.",
      "Plumbing for link-preview crawlers: explicit robots.txt allow-list + middleware short-circuit for Threads / Discord / Slack / Bluesky / Twitter / LinkedIn / Mastodon / WhatsApp / Telegram bots. Their unfurl fetches now bypass our generic crawler rules and rate limits since they only scrape pasted URLs, not the catalog.",
    ],
  },
  {
    date: "2026-05-11",
    intro:
      "Every profile now has a sense of identity built from listening data — a one-sentence bio, personality and milestone chips, and an interactive listener fingerprint. Plus a sitewide announcement banner, embed-widget polish, and Bluesky avatars across more list surfaces.",
    highlights: [
      "Auto-generated listener bio on profile pages. A live “Currently spinning A, B, and C” sentence derived from each user's last month of listening, with the artist names linking to their artist pages. When a profile owner has linked their Bluesky, that bio shows here instead — the two stay coherent without ever asking anyone to write anything.",
      "Listener archetype chips. 0–3 small personality tags computed from listening patterns — “Night owl” / “Morning listener” from time-of-day peaks, “Same-thing-on-repeat” / “Broad listener” from track concentration, “Discoverer” / “Habitual listener” from how much of this month's top artists are freshly added. Hover any chip for a plain-English explanation of why it landed.",
      "Listener milestone chips. Quantitative siblings to the archetype chips: total plays, distinct artists (“>500 artists” when above the listing cap), current listening streak, “Listening since 2018.” Both chip strips wrap together as one identity band under the bio.",
      "Interactive listener fingerprint. A radial-bar glyph on every profile header where each wedge is one of that user's top 24 artists, bar height = their relative plays, colour = a deterministic hash of the artist's top genre (so any two people who listen to a lot of, say, jazz share visible colour clusters in their fingerprints). Hover a wedge to highlight it and see the artist + play count; click to open the artist page. Works on desktop and mobile.",
      "Site-wide announcement banner. The dismissible bar at the top of the page is now a real feature — used here for the MusicBrainz maintenance heads-up earlier today, more notices as they come up.",
      "Activity feed: “X linked their Bluesky to Achordion.” When someone you follow on Bluesky links their Achordion profile, that event shows up in your feed with their Bluesky avatar + a direct link to their bsky.app.",
      "Bluesky avatars now flow into every user-card surface — Top Listeners on album pages, Followers / Following / Similar Users grids, Find Bluesky Friends in Settings. A linked profile reads as the same person everywhere.",
      "Embed widgets: light/dark background picker right above the snippet textarea (defaults to dark; existing embeds keep rendering dark with no change), and the “Open in Achordion” link moved to the upper-right of the card so it doesn't sit awkwardly between rows of service icons.",
      "Mobile site header polish: theme toggle, avatar, and sign-in button collapse into the hamburger menu on phones so the on-air pill has room to breathe in the trailing slot. Hamburger menu already carries every one of those entries — nothing's lost.",
    ],
  },
  {
    date: "2026-05-10",
    intro:
      "Optional Bluesky cross-platform identity, browser notifications for feed updates, richer Followers / Following / Similar Users cards, and a swath of mobile polish.",
    highlights: [
      "Optional Bluesky link. Paste your Bluesky handle into Settings (any handle — bsky.social or a custom domain like jherskowitz.com), drop your Achordion profile URL anywhere in your Bluesky bio for a one-time two-way handshake, and your Achordion profile renders your Bluesky avatar, display name, and bio inline. Same avatar swaps into the small pip in the top-right of every page. Pulled live from Bluesky, never copied here — edit your bio over there and it updates here within minutes. Single field, deletable any time, no OAuth, no permissions granted. Completely optional; profiles that don't link change nothing.",
      "Find your Bluesky friends on Achordion. Once you link, a new section in Settings surfaces the people you follow on Bluesky who've also linked their Achordion profile. Click through to their listening.",
      "Opt-in browser notifications when there's new activity on your feed. Toggle on under Settings → Feed notifications; pings only while an Achordion tab is open in your browser, never asks for permission unprompted, single-slot so a quiet stretch doesn't pile up a stack.",
      "Followers, Following, and Similar Users now use the same richer card: avatar, username, a “Currently into: artist 1, artist 2 & artist 3” line pulled from their last month of listening, plus their live on-air widget when they're playing. Similar Users gets tier chips (Highly / Similar / Somewhat similar) instead of a raw percentage, and the card click-target deep-links to their stats tab.",
      "Profile header reorganised so the currently-playing track sits right under the username — reads as part of the user's identity, not as a trailing footnote. Listen-along pill hugs the song info instead of floating to the right edge.",
      "Activity feed thanks now embed the playable thanked track inline, so a thanked pin spreads to your followers with the song intact.",
      "Stats page: All-time filter wired up correctly. The “All time” tab now actually loads all-time data (was silently falling back to last year).",
      "Mobile layout pass: profile-header Follow button stays pinned to the top-right corner so it's reachable without scrolling, radio-station popover no longer flows off the screen, pin-card kebab + favicons share a row, footer byline wraps cleanly into two lines and the link nav stacks into a tidy 2-column grid.",
      "Footer: new Parachord link, and the old “Discussions” entry is now “Feedback,” pointing at a public feedback board where you can request features and vote on others'.",
      "Dropped the sticky-footer pattern across the site — short pages (small followers lists, etc.) no longer have a dead-zone of empty grey between the content and the footer.",
    ],
  },
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
