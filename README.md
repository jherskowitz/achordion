# Achordion

A modern, open-source alternative front-end for [ListenBrainz](https://listenbrainz.org). Sister project to [Parachord](https://github.com/Parachord/parachord).

## What it is

Achordion mirrors every functional page that listenbrainz.org offers, with a fresh visual language and cleaner information architecture. Sign in with MusicBrainz (the same identity ListenBrainz itself uses), then browse your listens, stats, charts, recommendations, your feed, and the full LB explore surface — fresh releases, weekly playlists, similar listeners, Year in Music, LB Radio, Critical Darlings, and curated radio rewinds from public stations via [spinbin](https://github.com/jherskowitz/spinbin).

## Built to work with Parachord

Achordion is **the data view**; [Parachord](https://github.com/Parachord/parachord) is **the player**. They're designed to feel like one product across desktop, mobile, and web.

Every playable thing on Achordion — every track row, every album cover, every chart entry, every Radio Rewind cover, every Critical Darling pick, every LB Radio station, every "now playing" pin in your friends' feeds — has a `https://parachord.com/…` deep link (registered as a Universal Link on iOS and an App Link on Android, with `parachord://` as a parallel fallback for in-app webviews and share intents) that hands the tracklist off to Parachord without disrupting your library. Parachord wakes up if it isn't running, plays the track, and routes through whichever streaming service or local source the listener is set up with — so the same click does the right thing on every device. Tapping the same URL on a device *without* Parachord installed lands on the parachord.com pitch page instead of an OS error.

### Multi-source playback through one click

Parachord aggregates playback across **Spotify, Apple Music, SoundCloud, YouTube Music, Bandcamp, Tidal, and your local files** behind a single resolver pipeline. When you click "Play in Parachord" from an Achordion track or album, Parachord:

1. Resolves the track against every authorized source for the user
2. Picks the best match using a priority + confidence scoring system (the user's preferred services first, with a confidence floor that filters out wrong-song matches)
3. Plays through that source — Spotify Connect for Spotify, MusicKit JS for Apple Music, ExoPlayer for SoundCloud / local files, etc.

The user controls the priority order; Achordion just hands over the tracklist.

### Cross-platform scrobbling

Parachord scrobbles every play to **ListenBrainz, Last.fm, and Libre.fm** simultaneously, with full MBID enrichment so listens carry the canonical MusicBrainz identifiers (recording, release, artist) — not just freeform strings. ISRCs and durations come along too. The result: your Achordion view updates in near-real-time as Parachord scrobbles whatever you play.

If you scrobble from somewhere else — Spotify direct, a Pano Scrobbler on Android, NepTunes on a Mac, the Web Scrobbler browser extension — Achordion still reflects the activity through ListenBrainz. There's a curated list of compatible scrobblers in **Settings → Connections**.

### Protocol surface used by Achordion

The deep links Achordion emits, all defined by the parachord protocol ([PR #755](https://github.com/Parachord/parachord/pull/755)). Each verb is reachable under both the HTTPS Universal-Link form (what Achordion ships today) and the legacy `parachord://` custom scheme (Parachord-side parsers accept both):

| Achordion action | URL |
| --- | --- |
| Play a single track | `https://parachord.com/play?artist=…&title=…` |
| Play an album | `https://parachord.com/play/album?mbid=…` (or `?artist=…&title=…`) |
| Play a hosted playlist (XSPF / JSPF) | `https://parachord.com/play/playlist?url=…` |
| Play LB Radio | `https://parachord.com/play/radio?url=…&refill=…` |
| Listen along with a friend | `https://parachord.com/listen-along?service=listenbrainz&user=…` |
| Import a playlist into the library | `https://parachord.com/import?url=…` |

Parachord handles SSRF protection on the URL inputs and never mutates the user's library unless the link is `import`. Achordion never auto-fires any of these — every link is a user-initiated click.

## Stack

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS v4 + shadcn/ui
- Auth.js v5 with a custom MusicBrainz OAuth2 provider
- Recharts (via shadcn/ui charts) for Year in Music visualisations
- Zod for runtime validation of external API responses

External data sources:
- **MusicBrainz** — canonical music metadata, OAuth identity, artist / release-group / recording detail
- **ListenBrainz** — listens, stats, recommendations, fresh releases, LB Radio, Year in Music, the user feed
- **Wikidata + Wikimedia Commons** — artist photos (P18 → Special:FilePath)
- **Apple Music RSS / Wikipedia / spinbin / Critical Darlings RSS** — chart and editorial feeds

## Getting started

```bash
git clone https://github.com/jherskowitz/achordion.git
cd achordion
npm install
cp .env.example .env.local
# Fill in AUTH_SECRET, AUTH_MUSICBRAINZ_ID, AUTH_MUSICBRAINZ_SECRET, LISTENBRAINZ_TOKEN
npm run dev
```

Open http://localhost:3000.

### MusicBrainz OAuth setup

Register an OAuth application at <https://musicbrainz.org/account/applications> with redirect URI `http://localhost:3000/api/auth/callback/musicbrainz` for local dev. Paste the generated client ID and secret into `.env.local`. For production, register a second app with your deployed origin's callback URI — MusicBrainz only allows one redirect URI per OAuth application.

### CritiqueBrainz OAuth setup (optional)

Required only if you want the "write a review" flow on album pages (gated behind `flag:write_reviews`). CritiqueBrainz runs its own OAuth provider, separate from MusicBrainz. Sign in to CritiqueBrainz, then register an app at <https://critiquebrainz.org/profile/applications/> with redirect URI `http://localhost:3000/api/critiquebrainz/callback` for local dev (and a second app for production). Paste the generated client ID and secret into `.env.local` as `AUTH_CRITIQUEBRAINZ_ID` / `AUTH_CRITIQUEBRAINZ_SECRET`.

Generate `AUTH_SECRET` with:

```bash
npx auth secret
```

`LISTENBRAINZ_TOKEN` is required for LB Radio and the personalised feed. Find yours on your [ListenBrainz profile](https://listenbrainz.org/profile/) page.

## Deployment

Deployed on Vercel. Required environment variables (Project Settings → Environment Variables, all in the Production scope):

- `AUTH_SECRET`
- `AUTH_MUSICBRAINZ_ID`
- `AUTH_MUSICBRAINZ_SECRET`
- `AUTH_URL` — your Vercel domain (e.g. `https://achordion.vercel.app`)
- `LISTENBRAINZ_TOKEN`

Don't forget to add the production callback URL to your MusicBrainz OAuth application: `https://<your-vercel-domain>/api/auth/callback/musicbrainz`.

## License

[MIT](LICENSE) © Jason Herskowitz
