import Link from "next/link";
import { ExternalLink, Heart } from "lucide-react";
import { PageShell } from "@/components/achordion/page-shell";
import { PageHeader } from "@/components/achordion/page-header";
import { ContentSection } from "@/components/achordion/content-section";

export const metadata = { title: "About" };
// Static markup; rebuild at most once per day if traffic comes in.
// Combined with PUBLIC_ENTITY_CACHE in next.config.ts, the page
// renders once per 24h per Vercel edge, then serves from cache.
export const revalidate = 86400;

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
        eyebrow="The independent music community"
        title="People-Powered Music Discovery"
        description="Music discovery felt a lot more meaningful (and fun) when we weren't all trapped in our own algorithmic bubbles — locked away inside corporate silos. Achordion is part of an open community, powered by ListenBrainz, that puts listeners first — no matter how or where they listen."
      />

      {/* Same `max-w-2xl` as the PageHeader's description, left-
          aligned at the page edge — keeps the subhead and the
          section bodies on the same left rail. */}
      <div className="max-w-2xl space-y-12 pb-12">
        <ContentSection title="The pitch">
          <p>
            Connect with like-minded listeners across the globe to discover
            music that transcends services, platforms, and programming.
            Whether you stream from Spotify or Apple Music or Tidal, buy from
            Bandcamp, watch on YouTube, or play FLAC files off a NAS — your
            listening data flows into the same feed as everyone else&apos;s,
            and you can finally see what your friend is playing this week
            even if she&apos;s on Apple Music and you&apos;re on Spotify.
          </p>
          <p>
            Achordion is the front-door web experience.{" "}
            <Out href="https://github.com/Parachord/parachord">Parachord</Out>{" "}
            is the player every Play button hands off to. ListenBrainz is the
            ledger your listens live in. MusicBrainz is the encyclopedia
            underneath it all. Four independent, open-source, non-corporate
            layers — one coherent experience.
          </p>
        </ContentSection>

        <ContentSection title="The two-project tldr">
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
        </ContentSection>

        <ContentSection title="Why this exists">
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
        </ContentSection>

        <ContentSection title="What we're trying to build">
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
        </ContentSection>

        <ContentSection title="A view for artists, not just listeners">
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
        </ContentSection>

        <ContentSection title="Your data stays yours">
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
            polite to MetaBrainz&apos;s servers and pages stay fast), a
            separate cache mapping MusicBrainz recording IDs to known
            streaming-service URLs (see &quot;the recording-to-streaming-
            link gap&quot; further down for the why),
            and Vercel&apos;s privacy-focused Web Analytics for aggregate
            page-view counts. None of these build a profile of you, and
            none of them store anything you&apos;d consider yours.
          </p>
          <p>
            Your listens, loves, pins, follows, playlists, and stats all
            live in your ListenBrainz account, run by the MetaBrainz
            Foundation. Your identity lives at MusicBrainz. If Achordion
            disappeared tomorrow, none of <em>your</em> data would go
            with it — you&apos;d just point a different ListenBrainz
            client at the same account and pick up where you left off.
          </p>
        </ContentSection>

        <ContentSection title="A note on bots">
          <p>
            Achordion blocks AI training crawlers — GPTBot, ClaudeBot,
            CCBot, PerplexityBot, Applebot-Extended, Google-Extended,
            and friends — from walking our catalog routes. Partly to
            keep the site healthy under crawler load, partly because
            piping community-contributed listening data into a training
            set without attribution isn&apos;t the spirit this project
            was built on. Datacenter and proxy ASNs are blocked at the
            edge, per-IP rate limits cap any one client at a few
            requests per second, and our{" "}
            <Out href="https://github.com/jherskowitz/achordion/blob/main/app/robots.ts">
              robots.ts
            </Out>
            {" "}+{" "}
            <Out href="https://github.com/jherskowitz/achordion/blob/main/middleware.ts">
              middleware.ts
            </Out>
            {" "}are auditable in the public repo.
          </p>
        </ContentSection>

        <ContentSection title="Multi-source playback through one click">
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
        </ContentSection>

        <ContentSection title="The recording-to-streaming-link gap (and why we're filling it)">
          <p>
            MusicBrainz has built the canonical identity layer for
            recorded music — an MBID per recording, release, artist —
            and ListenBrainz has built the canonical listen-history
            layer on top of it. But the layer in between, &quot;where
            can I actually play <em>this</em> recording right now?&quot;,
            is arguably the data most lacking in the open music
            ecosystem today. There&apos;s no community-maintained,
            queryable map from MBID to Spotify / Apple Music / YouTube
            Music / Tidal / Bandcamp URLs. MusicBrainz&apos;s own URL
            relationships are sparse and editor-dependent; Odesli is
            commercial and rate-limited; the platforms themselves don&apos;t
            cross-reference each other.
          </p>
          <p>
            Achordion runs a public Redis-backed table that fills that
            gap. Each entry maps one recording MBID to the streaming
            services it&apos;s known to be available on, with the URL,
            service name, and host. Entries come from three sources, in
            increasing order of trust: cross-service link resolution
            (Odesli) when we can spare a call, MusicBrainz&apos;s own
            URL relationships when present, and{" "}
            <strong>active playback confirmations submitted by
            Parachord</strong> whenever a track plays successfully.
            Parachord&apos;s submissions outrank the others because
            they&apos;re proven matches, not inferred ones — they
            represent &quot;a real listener pressed play on this MBID
            via this URL and music came out.&quot;
          </p>
          <p>
            The same entry serves every visitor — no per-user state.
            Over time, as Parachord plays accumulate, the table becomes
            a community-contributed asset useful to any client building
            on top of MusicBrainz, not just Achordion. The eventual
            goal is to retire the Odesli fallback entirely and rely on
            the community-confirmed corpus, the same way MusicBrainz
            replaced Gracenote-era proprietary fingerprint databases
            for music identity.
          </p>
        </ContentSection>

        <ContentSection title="Cross-platform scrobbling">
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
        </ContentSection>

        <ContentSection title="Built on">
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
        </ContentSection>

        <ContentSection title="Who's behind it">
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
        </ContentSection>
      </div>
    </PageShell>
  );
}
