import Link from "next/link";
import { ExternalLink, Heart } from "lucide-react";
import { PageShell } from "@/components/achordion/page-shell";
import { PageHeader } from "@/components/achordion/page-header";

export const metadata = { title: "About" };

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold tracking-wide uppercase">{title}</h2>
      <div className="text-foreground/90 space-y-4 text-base leading-7">
        {children}
      </div>
    </section>
  );
}

// Light-blue editorial link styling shared by every inline link on
// the footer-linked content pages (about / donate). Sky-500 reads
// well on a white background; sky-400 is the dark-mode counterpart.
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

export default function AboutPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="About"
        title="What Achordion is"
        description="The independent music community and data layer. An open-source front-end for ListenBrainz, designed to feel like one product with Parachord, the universal music player."
      />

      {/* Same `max-w-2xl` as the PageHeader's description, left-
          aligned at the page edge — keeps the subhead and the
          section bodies on the same left rail. */}
      <div className="max-w-2xl space-y-12 pb-12">
        <Section title="The two-project tldr">
          <p>
            <strong>
              Achordion is the independent music community and data layer.
            </strong>{" "}
            <Out href="https://github.com/Parachord/parachord">Parachord</Out>{" "}
            <strong>is the player.</strong>{" "}
            Together they&apos;re the open-source counterpoint to Spotify
            / Apple Music — where the community, the data, and the
            playback are tangled inside a walled garden. Here those three
            layers are separate, open, and yours.
          </p>
          <p>
            Achordion mirrors every functional page that listenbrainz.org
            offers — listens, stats, charts, fresh releases, the user feed,
            Year in Music, LB Radio, Critical Darlings — with a fresh
            visual language and cleaner information architecture. Parachord
            plays whatever you click. They&apos;re built to feel like one
            product across desktop, mobile, and web.
          </p>
        </Section>

        <Section title="Why this exists">
          <p>
            ListenBrainz is the open-source, MetaBrainz-run alternative to
            last.fm — and it&apos;s great. But its UI hasn&apos;t had the
            love its data deserves. Achordion is an attempt to give that
            data a home that&apos;s easy to spend time in: cleaner reading,
            denser browsing, every artist / album / track one click away,
            and zero friction between &quot;I see something I like&quot; and
            &quot;I&apos;m playing it.&quot;
          </p>
          <p>
            That last part is where Parachord comes in. Every playable thing
            on Achordion — every track row, every album cover, every chart
            entry, every Critical Darling, every &quot;now playing&quot; pin
            in a friend&apos;s feed — has a <code>parachord://</code> deep
            link that hands the tracklist to Parachord without disrupting
            your library. Parachord wakes if it isn&apos;t running, plays
            the track, and routes through whichever streaming service or
            local source the listener is set up with.
          </p>
        </Section>

        <Section title="What we're trying to build">
          <ol className="ml-6 list-decimal space-y-3">
            <li>
              <strong>An open community for listeners,</strong>{" "}
              regardless of which streaming service they use. Today
              Spotify users, Apple Music users, Tidal users, Bandcamp
              die-hards, and the people on a NAS full of FLACs all live
              in separate silos — none of them can see what the others
              are listening to. Achordion is the place where that wall
              comes down: every listener&apos;s scrobbles flow into the
              same feed regardless of where the music actually came
              from. Discover what your friend is playing this week even
              if she&apos;s on Apple Music and you&apos;re on Spotify.
            </li>
            <li>
              <strong>
                A modern, generously-designed UI on top of ListenBrainz
                and MusicBrainz.
              </strong>{" "}
              The data that the MetaBrainz Foundation has built is
              extraordinary; the front-end shouldn&apos;t be the
              limiting factor in spending time with it. We want the
              experience to feel as polished as the proprietary
              services people are migrating from — without the
              proprietary catches.
            </li>
            <li>
              <strong>
                A push for the open-source music database to keep
                growing.
              </strong>{" "}
              Every &quot;+ Add sources&quot; tile, every breadcrumb
              deep-linked back to MusicBrainz, every chart that points
              users into the canonical entity page is a small nudge
              toward editing MB. The more people who can find a missing
              relationship and fix it in one click, the better the open
              data gets — and the better Achordion (and every other MB
              client) gets for free.
            </li>
            <li>
              <strong>
                User-owned data, full portability, and listening
                insights you can see all year.
              </strong>{" "}
              Your data lives in your ListenBrainz / MusicBrainz
              accounts, not Achordion&apos;s. Export anywhere, point any
              client at the same accounts, leave whenever. And the
              listening visualizations — the charts, the heatmaps, the
              top-X breakdowns, the year-in-music style summaries —
              shouldn&apos;t only show up once a year on a single
              proprietary platform&apos;s schedule. Your habits are
              interesting all the time; the views to explore them
              should be available all the time.
            </li>
          </ol>
        </Section>

        <Section title="A view for artists, not just listeners">
          <p>
            Today an artist who wants to understand their audience has
            to log into Spotify for Artists, Apple Music for Artists,
            YouTube Studio, Bandcamp&apos;s artist dashboard, and a
            handful of others — each showing only the slice of fans
            on that one platform. The full picture lives nowhere.
          </p>
          <p>
            Because ListenBrainz collects scrobbles across services,
            and because Parachord scrobbles every play regardless of
            where the audio came from, an artist&apos;s page on
            Achordion shows the whole audience in one place: who
            their top listeners are, how many people are spinning
            each release, which tracks are getting traction, which
            cities the listening is coming from. One view, not seven
            tabs — and the data the artist sees is exactly the data
            their fans see. No black-box weighting, no platform-
            specific dark patterns.
          </p>
          <p>
            The same affordance works for fans curious about an
            artist&apos;s reach. If you discover a small band on
            Bandcamp and want to know how many people are seriously
            into them across the whole listening community, the
            answer&apos;s on their Achordion page rather than scattered
            across half a dozen platform-specific stats pages.
          </p>
        </Section>

        <Section title="Your data stays yours">
          <p>
            <strong>
              Achordion doesn&apos;t store your listening data.
            </strong>{" "}
            There&apos;s no Achordion-side profile of you, no record of
            what you&apos;ve played, no record of who you follow — all of
            that lives in your ListenBrainz account and is queried live
            on each page view. Sign-in is OAuth against MusicBrainz, the
            same way opening listenbrainz.org would authenticate you.
          </p>
          <p>
            The only Achordion-side state is operational: a Redis cache
            that memoizes public ListenBrainz API responses (so we&apos;re
            polite to MetaBrainz&apos;s servers and pages stay fast),
            and Vercel&apos;s privacy-focused Web Analytics for
            aggregate page-view counts. Neither one builds a profile of
            you, and neither one stores anything you&apos;d consider
            yours.
          </p>
          <p>
            Your listens, loves, pins, follows, playlists, and stats all
            live in your ListenBrainz account, run by the MetaBrainz
            Foundation. Your identity lives at MusicBrainz. If Achordion
            disappeared tomorrow, none of <em>your</em> data would go
            with it — you&apos;d just point a different ListenBrainz
            client at the same account and pick up where you left off.
          </p>
        </Section>

        <Section title="Multi-source playback through one click">
          <p>
            Parachord aggregates playback across{" "}
            <strong>
              Spotify, Apple Music, SoundCloud, YouTube Music, Bandcamp,
              Tidal, and your local files
            </strong>{" "}
            behind a single resolver. Click &quot;Play in Parachord&quot;
            from Achordion and Parachord:
          </p>
          <ol className="ml-6 list-decimal space-y-1.5">
            <li>Resolves the track against every authorized source.</li>
            <li>
              Picks the best match using a priority + confidence scoring
              system — your preferred services first, with a confidence
              floor that filters out wrong-song matches.
            </li>
            <li>
              Plays through that source: Spotify Connect, MusicKit JS,
              ExoPlayer for local / SoundCloud, etc.
            </li>
          </ol>
          <p>
            You control the priority order; Achordion just hands over the
            tracklist.
          </p>
        </Section>

        <Section title="Cross-platform scrobbling">
          <p>
            Parachord scrobbles every play to{" "}
            <strong>ListenBrainz, Last.fm, and Libre.fm</strong>{" "}
            simultaneously, with full MBID enrichment so listens carry the
            canonical MusicBrainz identifiers (recording, release, artist) —
            not just freeform strings. ISRCs and durations come along too.
            Your Achordion view updates in near-real-time as Parachord
            scrobbles whatever you play.
          </p>
          <p>
            If you scrobble from somewhere else — Spotify direct, Pano
            Scrobbler on Android, NepTunes on a Mac, the Web Scrobbler
            browser extension — Achordion still reflects the activity through
            ListenBrainz.
          </p>
        </Section>

        <Section title="Built on">
          <p>
            <Out href="https://musicbrainz.org">MusicBrainz</Out>{" "}
            for canonical music metadata and identity (sign in is the same
            MB account ListenBrainz uses).{" "}
            <Out href="https://listenbrainz.org">ListenBrainz</Out>{" "}
            for listen history, stats, and recommendations.{" "}
            <Out href="https://coverartarchive.org">Cover Art Archive</Out>{" "}
            for, well, cover art. Wikidata + Wikimedia Commons for artist
            photos. And occasional editorial feeds — Apple Music charts,
            !earshot college-radio charts, Critical Darlings — to round out
            the discovery surface.
          </p>
          <p>
            None of that infrastructure is mine. The MetaBrainz Foundation
            runs MusicBrainz and ListenBrainz on donations and a small
            team. If you get value from Achordion, please{" "}
            <Link
              href="/donate"
              className={`${LINK_CLASS} inline-flex items-center gap-1`}
            >
              <Heart className="size-3.5" />
              support them
            </Link>.
          </p>
        </Section>

        <Section title="Who's behind it">
          <p>
            Achordion and Parachord are both made by{" "}
            <Out href="https://github.com/jherskowitz">J Herskowitz</Out>.
            Both projects are open source and gladly accept issues / PRs:
          </p>
          <ul className="ml-6 list-disc space-y-1.5">
            <li>
              <Out href="https://github.com/jherskowitz/achordion">
                github.com/jherskowitz/achordion
                <ExternalLink className="ml-1 inline size-3 align-text-top" />
              </Out>
            </li>
            <li>
              <Out href="https://github.com/Parachord/parachord">
                github.com/Parachord/parachord
                <ExternalLink className="ml-1 inline size-3 align-text-top" />
              </Out>
            </li>
            <li>
              <Out href="https://github.com/jherskowitz/spinbin">
                github.com/jherskowitz/spinbin
                <ExternalLink className="ml-1 inline size-3 align-text-top" />
              </Out>{" "}
              — public-radio playlist scraper that powers the Radio Rewinds
              tab.
            </li>
          </ul>
        </Section>
      </div>
    </PageShell>
  );
}
