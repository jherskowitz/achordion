import Link from "next/link";
import { PageShell } from "@/components/achordion/page-shell";
import { PageHeader } from "@/components/achordion/page-header";
import { ContentSection } from "@/components/achordion/content-section";

export const metadata = { title: "FAQ" };
// See app/(content)/layout.tsx for the static-rendering rationale.
export const revalidate = 86400;

// Same light-blue editorial link style used on /about and /donate.
const LINK_CLASS =
  "text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 hover:underline underline-offset-4";

function Out({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={LINK_CLASS}
    >
      {children}
    </a>
  );
}

const TOC: Array<{ id: string; label: string }> = [
  { id: "account", label: "How do I create an account?" },
  { id: "client", label: "Is Achordion the same as ListenBrainz?" },
  { id: "scrobbling", label: "How do I get my listens into ListenBrainz?" },
  { id: "playback", label: "How do I actually play music from Achordion?" },
  { id: "data-sources", label: "Where does the data on Achordion come from?" },
  { id: "data-ownership", label: "What does Achordion store about me?" },
  { id: "edit-delete", label: "How do I edit or delete my listening history?" },
  { id: "privacy", label: "Who can see my listens?" },
  { id: "missing-data", label: "An artist or album is missing — how do I fix it?" },
  { id: "open-source", label: "Is Achordion open source?" },
  { id: "support", label: "How do I support the project?" },
  { id: "contact", label: "Still have questions? How do I get in touch?" },
];

export default function FaqPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="FAQ"
        title="Frequently asked questions"
        description="The short answers to the questions that come up most. If you don't see yours here, the About page goes deeper, and the GitHub repo is the right place to file anything else."
      />

      <div className="max-w-2xl space-y-12 pb-12">
        {/* Table of contents — anchor links to each section. */}
        <nav
          aria-label="FAQ contents"
          className="border-border/60 rounded-xl border p-4"
        >
          <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            On this page
          </h2>
          <ul className="mt-3 space-y-1.5 text-sm">
            {TOC.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id}`} className={LINK_CLASS}>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <ContentSection id="account" title="How do I create an account?">
          <p>
            Achordion uses your{" "}
            <Out href="https://musicbrainz.org">MusicBrainz</Out> account for
            sign-in — the same account that{" "}
            <Out href="https://listenbrainz.org">ListenBrainz</Out> uses. There
            is no separate Achordion account.
          </p>
          <p>
            If you don&apos;t have a MusicBrainz account yet, sign up at{" "}
            <Out href="https://musicbrainz.org/register">
              musicbrainz.org/register
            </Out>{" "}
            (it takes about a minute), then come back and click{" "}
            <Link href="/login" className={LINK_CLASS}>
              Login with a MusicBrainz account
            </Link>
            . The Achordion welcome flow walks you through the rest of the
            setup — imports, scrobblers, and connecting a player — so your
            profile is populated by the time you start browsing.
          </p>
          <p>
            If Achordion went away tomorrow, your account and all of your data
            would still be at MusicBrainz and ListenBrainz, untouched.
          </p>
        </ContentSection>

        <ContentSection id="client" title="Is Achordion the same as ListenBrainz?">
          <p>
            <strong>No — Achordion is a client on top of ListenBrainz.</strong>{" "}
            ListenBrainz is the data layer: it stores your scrobbles, builds
            your stats, generates your recommendations, and runs the
            recommendation engine for things like ListenBrainz Radio, Weekly Jams, and
            Year in Music. The MetaBrainz Foundation runs it as a free,
            open-source service.
          </p>
          <p>
            Achordion is a separate, also open-source, web front-end on top of
            that data — designed to be denser, friendlier, and tightly
            integrated with{" "}
            <Out href="https://parachord.com">Parachord</Out> for one-click
            playback. The official ListenBrainz site (
            <Out href="https://listenbrainz.org">listenbrainz.org</Out>) is
            still there, still works, and reads from the same account. You can
            move between clients freely; nothing is locked to Achordion.
          </p>
        </ContentSection>

        <ContentSection
          id="scrobbling"
          title="How do I get my listens into ListenBrainz?"
        >
          <p>
            ListenBrainz only knows about plays you tell it about. There are
            three ways to get your listening history in there, and you can
            combine them.
          </p>
          <p>
            <strong>1. One-time imports / backfills.</strong> ListenBrainz can
            import your existing history from{" "}
            <Out href="https://listenbrainz.org/profile/import/">Last.fm,
            Libre.fm, and Spotify</Out>{" "}
            (Spotify only goes back ~50 plays via the API; for the full
            history, request a data export from Spotify and upload the JSON
            file). This is the fastest way to make Achordion feel populated on
            day one.
          </p>
          <p>
            <strong>2. Direct service connections.</strong> In your{" "}
            <Out href="https://listenbrainz.org/settings/music-services/details/">
              ListenBrainz Music Services settings
            </Out>{" "}
            you can connect Spotify, Apple Music, SoundCloud, and others —
            ListenBrainz then scrobbles your plays from those services
            automatically.
          </p>
          <p>
            <strong>3. A scrobbler app on whatever you actually use to
            play music.</strong> A scrobbler watches your player and sends
            listens to ListenBrainz in real time. Pick whichever fits the
            platforms and players you actually use:
          </p>
          <ul className="ml-6 list-disc space-y-1.5">
            <li>
              <Out href="https://parachord.com">
                <strong>Parachord</strong>
              </Out>{" "}
              <em>(recommended)</em> — desktop + mobile + web player that
              resolves any track against Spotify, Apple Music, Tidal, YouTube
              Music, SoundCloud, Bandcamp, and your local files, then scrobbles
              every play to ListenBrainz with full MBIDs and ISRCs. It&apos;s
              the player Achordion is built to pair with: every Play button on
              every page hands off to it via{" "}
              <code>parachord://</code> deep links.
            </li>
            <li>
              <Out href="https://web-scrobbler.com">Web Scrobbler</Out> —
              browser extension that scrobbles from YouTube, SoundCloud,
              Bandcamp, Tidal Web, Apple Music Web, and 100+ other web
              players.
            </li>
            <li>
              <Out href="https://github.com/kawaiiDango/pano-scrobbler">
                Pano Scrobbler
              </Out>{" "}
              (Android) — scrobbles from any Android music app.
            </li>
            <li>
              <Out href="https://neptunes.app">NepTunes</Out> (macOS) — Apple
              Music + Spotify desktop scrobbler for Mac.
            </li>
            <li>
              <Out href="https://github.com/InputUsername/rescrobbled">
                Rescrobbled
              </Out>{" "}
              (Linux) — MPRIS scrobbler that catches plays from any compliant
              Linux player.
            </li>
            <li>
              <Out href="https://wiki.musicbrainz.org/ListenBrainz/Software">
                And many more
              </Out>{" "}
              — there are scrobblers for nearly every platform and player. The
              MetaBrainz wiki keeps the canonical list.
            </li>
          </ul>
        </ContentSection>

        <ContentSection
          id="playback"
          title="How do I actually play music from Achordion?"
        >
          <p>
            Achordion never plays audio itself — it points to other things.
            There are two paths.
          </p>
          <p>
            <strong>Preferred: Parachord.</strong> Install{" "}
            <Out href="https://parachord.com">Parachord</Out> and every Play
            button on every Achordion page just works. Click a track, an album,
            or a ListenBrainz Radio station and Parachord wakes (if it isn&apos;t
            already running), resolves the tracklist against whichever
            services you&apos;ve authorized — Spotify, Apple Music, Tidal,
            SoundCloud, Bandcamp, YouTube Music, your local FLACs — and plays
            from whichever ranks highest in your priority order. One click,
            anywhere. No &quot;open in Spotify / open in Apple Music&quot; forks.
          </p>
          <p>
            <strong>Without Parachord:</strong> every artist, album, and track
            page surfaces &quot;Listen on…&quot; links to dozens of services
            (Spotify, Apple Music, Tidal, YouTube Music, SoundCloud, Bandcamp,
            Deezer, Jiosaavn, official sites, and more) — wherever the open
            music graph knows the entity exists. Click whichever one you
            already subscribe to.
          </p>
          <p>
            <strong>Missing a service link?</strong> The links come from
            relationships in MusicBrainz. If a service is missing, you can{" "}
            <Out href="https://musicbrainz.org/doc/How_to_Add_External_Links">
              add it on MusicBrainz
            </Out>{" "}
            — Achordion (and every other MusicBrainz client) picks the new
            link up the next time the entity is fetched.
          </p>
        </ContentSection>

        <ContentSection
          id="data-sources"
          title="Where does the data on Achordion come from?"
        >
          <p>
            Every page on Achordion is composed live from open data sources:
          </p>
          <ul className="ml-6 list-disc space-y-1.5">
            <li>
              <Out href="https://musicbrainz.org">MusicBrainz</Out> — canonical
              metadata for artists, releases, recordings, labels, tags, and the
              external links between them.
            </li>
            <li>
              <Out href="https://listenbrainz.org">ListenBrainz</Out> — your
              listens, your stats, charts, recommendations (Weekly Jams, Weekly
              Explorations, ListenBrainz Radio), Year in Music, and the social
              graph.
            </li>
            <li>
              <Out href="https://coverartarchive.org">Cover Art Archive</Out> —
              cover art for releases and release-groups.
            </li>
            <li>
              <Out href="https://www.wikidata.org">Wikidata</Out> +{" "}
              <Out href="https://commons.wikimedia.org">Wikimedia Commons</Out>{" "}
              — artist photos and biographical data.
            </li>
            <li>
              Editorial feeds — Apple Music charts (by country),{" "}
              <Out href="https://www.earshot-online.com">!earshot</Out> and
              NACC college-radio charts, Critical Darlings — to round out
              discovery.
            </li>
          </ul>
          <p>
            None of this infrastructure is Achordion&apos;s. The MetaBrainz
            Foundation runs MusicBrainz and ListenBrainz on donations and a
            small team. If you find Achordion useful, please{" "}
            <Link href="/donate" className={LINK_CLASS}>
              support them
            </Link>
            .
          </p>
        </ContentSection>

        <ContentSection id="data-ownership" title="What does Achordion store about me?">
          <p>
            <strong>
              Almost nothing — and nothing you&apos;d consider yours.
            </strong>{" "}
            There is no Achordion-side profile of you. No record of what
            you&apos;ve played, who you follow, what you&apos;ve loved, or
            what playlists you&apos;ve made — all of that lives in your
            ListenBrainz account and is queried live on each page view.
          </p>
          <p>The only Achordion-side state is operational:</p>
          <ul className="ml-6 list-disc space-y-1.5">
            <li>
              A Redis cache that memoizes public ListenBrainz / MusicBrainz API
              responses so we&apos;re polite to MetaBrainz&apos;s servers and
              pages stay fast. Nothing user-specific is keyed to you.
            </li>
            <li>
              <Out href="https://vercel.com/docs/analytics">
                Vercel&apos;s privacy-focused Web Analytics
              </Out>{" "}
              for aggregate page-view counts. No cookies, no per-user
              tracking, no profile of you.
            </li>
          </ul>
          <p>
            Sign-in is OAuth against MusicBrainz, the same way logging into
            listenbrainz.org would. If Achordion disappeared tomorrow, none of
            your data would go with it — you&apos;d point a different
            ListenBrainz client at the same account and pick up where you left
            off.
          </p>
        </ContentSection>

        <ContentSection
          id="edit-delete"
          title="How do I edit or delete my listening history?"
        >
          <p>
            Because Achordion doesn&apos;t store your listens, the editing and
            deletion happens at ListenBrainz directly:
          </p>
          <ul className="ml-6 list-disc space-y-1.5">
            <li>
              <strong>Delete a single listen:</strong> on{" "}
              <Out href="https://listenbrainz.org">listenbrainz.org</Out>, open
              your profile, hover the listen, and click the trash icon.
            </li>
            <li>
              <strong>Delete listens in bulk / wipe history:</strong>{" "}
              <Out href="https://listenbrainz.org/settings/delete-listens/">
                ListenBrainz Settings → Delete Listens
              </Out>
              .
            </li>
            <li>
              <strong>Delete the entire account:</strong>{" "}
              <Out href="https://listenbrainz.org/settings/delete/">
                Settings → Delete Account
              </Out>
              . This wipes everything ListenBrainz holds about you.
            </li>
            <li>
              <strong>Edit metadata for a listen</strong> (wrong artist,
              missing album): use the &quot;link with MusicBrainz&quot;
              affordance on the ListenBrainz listen, which lets you map it to
              the canonical recording. Achordion will reflect the edit on its
              next page load.
            </li>
          </ul>
          <p>
            Once you&apos;ve made the change at ListenBrainz, Achordion picks
            it up automatically — there&apos;s no separate Achordion-side
            history to clean up.
          </p>
        </ContentSection>

        <ContentSection id="privacy" title="Who can see my listens?">
          <p>
            Visibility is controlled at ListenBrainz, not at Achordion.
            ListenBrainz profiles are public by default — your listens, stats,
            and follow graph are visible to anyone who visits your profile, the
            same way Last.fm has worked since 2002.
          </p>
          <p>
            You can toggle individual settings (e.g.&nbsp;hide listening
            activity) under{" "}
            <Out href="https://listenbrainz.org/settings/">
              ListenBrainz Settings
            </Out>
            . Whatever you set there is what Achordion shows, because Achordion
            is just rendering ListenBrainz&apos;s public API.
          </p>
        </ContentSection>

        <ContentSection
          id="missing-data"
          title="An artist or album is missing — how do I fix it?"
        >
          <p>
            Almost every &quot;why isn&apos;t X here&quot; question on
            Achordion is really a MusicBrainz question, because MusicBrainz
            is the canonical source.
          </p>
          <ul className="ml-6 list-disc space-y-1.5">
            <li>
              <strong>Missing artist photo:</strong> add it to{" "}
              <Out href="https://www.wikidata.org">Wikidata</Out> /{" "}
              <Out href="https://commons.wikimedia.org">Wikimedia Commons</Out>{" "}
              and link the Wikidata entity to the MusicBrainz artist.
            </li>
            <li>
              <strong>Missing cover art:</strong> upload it to the{" "}
              <Out href="https://coverartarchive.org">Cover Art Archive</Out>{" "}
              against the appropriate release.
            </li>
            <li>
              <strong>Missing streaming-service link:</strong> add it as an
              external relationship on the MusicBrainz artist, release, or
              recording —{" "}
              <Out href="https://musicbrainz.org/doc/How_to_Add_External_Links">
                guide here
              </Out>
              .
            </li>
            <li>
              <strong>Missing the artist or release entirely:</strong> create
              the entity on MusicBrainz. The community-edited DB is the long
              game; every fix improves Achordion <em>and</em> every other
              MusicBrainz client.
            </li>
          </ul>
          <p>
            Achordion caches MusicBrainz responses for a short window, so
            edits usually show up within minutes.
          </p>
        </ContentSection>

        <ContentSection id="open-source" title="Is Achordion open source?">
          <p>
            Yes. The code lives at{" "}
            <Out href="https://github.com/jherskowitz/achordion">
              github.com/jherskowitz/achordion
            </Out>
            . Issues and PRs are welcome. The architecture document in{" "}
            <Out href="https://github.com/jherskowitz/achordion/blob/main/AGENTS.md">
              AGENTS.md
            </Out>{" "}
            is the fastest way to get oriented.
          </p>
          <p>
            Parachord is open source too:{" "}
            <Out href="https://github.com/Parachord/parachord">
              github.com/Parachord/parachord
            </Out>
            .
          </p>
        </ContentSection>

        <ContentSection id="support" title="How do I support the project?">
          <p>
            The most important thing you can do is{" "}
            <Out href="https://metabrainz.org/donate">
              donate to the MetaBrainz Foundation
            </Out>{" "}
            — they run MusicBrainz and ListenBrainz, and Achordion would not
            exist without them.
          </p>
          <p>
            Beyond that: edit MusicBrainz when you spot something wrong, file
            issues / PRs against{" "}
            <Out href="https://github.com/jherskowitz/achordion">
              the Achordion repo
            </Out>
            , and tell a friend on a different streaming service that they can
            finally see what you&apos;re listening to.
          </p>
        </ContentSection>

        <ContentSection
          id="contact"
          title="Still have questions? How do I get in touch?"
        >
          <p>
            The best place is{" "}
            <Out href="https://github.com/jherskowitz/achordion/discussions">
              GitHub Discussions
            </Out>
            . Pick the <strong>Q&amp;A</strong>{" "}
            category for &quot;how do I…&quot; or &quot;what does X
            mean&quot; questions, <strong>Ideas</strong>{" "}
            for feature suggestions, or <strong>Show &amp; Tell</strong>{" "}
            if you want to share what you&apos;ve found. Other listeners can
            chime in, answers stay searchable, and nothing gets lost in a DM.
          </p>
          <p>
            If something is genuinely <em>broken</em> — a page errors, a play
            button doesn&apos;t do anything, a chart shows the wrong data —
            file an issue on{" "}
            <Out href="https://github.com/jherskowitz/achordion/issues">
              the Achordion repo
            </Out>{" "}
            instead. Bug reports + feature requests live there; questions and
            conversation live in Discussions.
          </p>
        </ContentSection>
      </div>
    </PageShell>
  );
}
