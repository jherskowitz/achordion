---
title: "The question that woke me up this morning"
slug: "the-question-that-woke-me-up"
description: "Can the distributed network of Parachord players — resolving thousands of tracks a day across services — implicitly contribute to an open database of multi-service streaming links that benefits everyone, even people who don't use Parachord? Yes. Yes they can."
date: 2026-05-11
---

The question that woke me up this morning:

> Can the distributed network of Parachord players — that are resolving thousands of tracks a day to multiple music services and storefronts — implicitly\* contribute to an open database of multi-service streaming links for artists, albums, and tracks, leveraged by [Achordion](https://achordion.xyz) so that everyone benefits, even if they don't use Parachord?

A: Yes, yes they can.

<sup>\*or you can opt out from the Plugins tab, but sharing is caring.</sup>

<iframe
  width="100%"
  height="450"
  src="https://www.youtube.com/embed/gOujIGsN7Ds"
  title="Parachord + Achordion: multi-service smart-links, by accident on purpose"
  frameborder="0"
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
  allowfullscreen
></iframe>

## What this actually does

You've shared a song with someone on the wrong service. Everyone has. You're on Spotify, they're on Apple Music. You paste the link. They squint. They copy the title, paste it into their own app, hope they get the right version. Discovery that should feel exciting starts to feel like data entry.

Parachord and Achordion just shipped an integration that fixes this for everyone — for free, on the open web, whether or not you ever install Parachord.

Every time someone plays a track in Parachord, the player has already done the hard work of finding that recording on whichever streaming service the listener is set up with — Spotify, Apple Music, YouTube Music, Tidal, Bandcamp, SoundCloud, the lot. That match isn't just internal state. It's a *human-confirmed pairing*: a real listener picked the song, picked a service, pressed play, and audio came out. The more the Parachord community listens, the better the dataset becomes for everyone.

We're now flowing those confirmations back to Achordion's public link table. As Parachord users listen, the table fills in. As the table fills in, every Achordion page for every recording and album sprouts a row of streaming-service tiles that point at the *same song* on each platform. Click whichever service you use. No copy-paste, no search.

This works without Parachord. Send a friend an Achordion link, the friend on Apple Music clicks the Apple tile, the friend on Spotify clicks the Spotify tile, and everyone's listening to the actual song you meant.

## What's in Parachord 0.9.2

The submission half — Parachord contributing verified matches back to Achordion — ships in [Parachord 0.9.2](https://github.com/Parachord/parachord/releases/tag/v0.9.2), out today. (Same release that drops the "beta" tag from the version string. Bigger milestone than the .2 bump suggests.)

A few things landed alongside the submit pipeline:

- **"View on Achordion" right-click** on tracks, albums, and artists. One click out of Parachord into the canonical multi-service landing page for whatever you're looking at.
- **Share links + embed codes** on tracks and albums now route through Achordion. Copy a share link from Parachord, paste it anywhere, and the recipient lands on a service-agnostic page that works for them whether they have Parachord or not.
- **Submissions are on by default**, with no personal data attached — just the MusicBrainz ID of the track plus the streaming URLs Parachord matched it to. If you'd rather not contribute, the toggle lives in the Plugins tab.

The other half — Parachord *consuming* the community-built database to skip live resolver searches when Achordion already has a known-good match — is the next thing on the roadmap. Today the contribution flows one way; soon it'll close the loop and Parachord itself will resolve faster as the table grows.

(0.9.2 also ships a meaningful chunk of performance + reliability work — cold-launch is snappier, big local-library imports no longer freeze the app, embedded album art shows up immediately, listen-along works again, and the resolver does less work in a smarter order. The [full release notes](https://github.com/Parachord/parachord/releases/tag/v0.9.2) have the details.)

## The two sides

**For listeners without Parachord** — Achordion is a multi-service "play this on whatever service you use" landing page. Free. Open. Same shape no matter who's looking at it.

**For listeners with Parachord** — playlists and stations work end to end. You can't really hand someone a Spotify-only playlist URL if they're an Apple Music user — they'd be hunting and pecking through 30 tracks one at a time, hoping each one lands on the right song. Most people just don't bother. Parachord plays the whole thing on whichever service *you* have, so passing playlists and stations across services becomes the obvious thing instead of the impossible one.

Same Achordion link, both audiences. The Parachord crowd gets lean-back; everyone else gets the smart-link landing.

## For artists: free, embeddable, multi-service smart-link pages

Multi-service "play me on the service of your choice" pages — Songlink, Linkfire, Linktree's music tier — have historically been a paid product. Useful, but those subscriptions add up, and you're routing your fans through someone else's branding for the privilege.

Achordion's track and album pages *are* multi-service smart links. Every recording and every album gets a canonical URL you can paste anywhere — a bio, a newsletter, a YouTube description, an Instagram link-in-bio — and the page itself shows the streaming row plus an "open in Achordion" affordance. Free. Open source. Attributable back to MusicBrainz and ListenBrainz, the open-data foundations the whole thing sits on.

And every page has an embed widget. Drop something like this into your own site:

```html
<iframe src="https://achordion.xyz/embed/album/efa54250-c7ba-47aa-9761-9a56aaf06887" width="600" height="260" loading="lazy" style="border:0;border-radius:12px" title="Achordion album"></iframe>
```

…and visitors get a clean cover-art card with the streaming services available, branded as part of *your* page rather than someone else's. Tracks get the same treatment in a more compact card; albums add an expandable tracklist with per-track service rows.

## The bigger picture

The mapping from "this recording" to "the streaming URLs where it lives" is, surprisingly, the open music ecosystem's biggest data gap right now. MusicBrainz built the canonical metadata layer. ListenBrainz built the canonical listen-history layer. The layer in between — *where can I actually play this thing right now?* — has never had a community-curated open home. Commercial services charge for it. MusicBrainz's editor-driven URL relationships are sparse and slow to fill, because the only way to populate them is for someone to sit down and search, copy, and paste one streaming service link at a time.

Parachord plus Achordion is the implicit-contribution version of that work. Nobody sits down to edit. The data gets built as a side effect of people listening to music. The same playbook MusicBrainz itself used against the closed fingerprint databases of the early 2000s: give humans the right tools and let them, just by being themselves, build something better than the corporate alternative.

Sharing is caring.

---

If you're a listener: click around [achordion.xyz](https://achordion.xyz). Pin a track, share a station, see what shows up.

If you're an artist: find your album page on [achordion.xyz](https://achordion.xyz), click the **Embed** button, and copy the snippet straight into your site.

If you're already on Parachord, [grab 0.9.2](https://github.com/Parachord/parachord/releases/tag/v0.9.2) — every track you play now quietly grows the open table. If you're not running Parachord yet, [parachord.com](https://parachord.com) is the next step. Every play helps.
