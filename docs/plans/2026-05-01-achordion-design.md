# Achordion — v0 Design

**Date:** 2026-05-01
**Status:** Validated, ready for Phase 0 bootstrap
**Working title:** Achordion (sister project to Parachord)

## Summary

Achordion is a public, open-source alternative front-end for ListenBrainz, built to feel more like a 2026 product than the current listenbrainz.org UI. It mirrors every functional page LB ships today and is structured so we can add Achordion-only features on top of LB's listening data over time.

## Goals

- Cover ListenBrainz's full page surface area from day one (wide and shallow).
- Use a last.fm-inspired information architecture with a fresh visual language — distinctly Achordion, not a clone.
- Sign-in via MusicBrainz OAuth2 (the same identity ListenBrainz itself uses), no custom accounts.
- Keep v0 read-only; defer LB user tokens and write actions to a later phase.
- Be open-source-friendly: deployable to Vercel out of the box, self-hostable with modest infra.

## Non-goals (v0)

- Submitting listens, editing pins/playlists, or any LB write actions.
- Achordion-only social graph (follows live in LB).
- Mobile native apps.
- A backing database — v0 needs no persistent storage.

## Architecture

Three layers:

1. **Edge / SSR layer.** Public pages render server-side for shareable, indexable URLs and fast first paint. Data fetched via Next's `fetch` cache with tag-based invalidation.
2. **Route handlers (`/api/*`).** Thin proxies in front of LB and MusicBrainz. Attach auth headers when signed in, cache aggressively, shape responses for the UI, hide tokens from the browser.
3. **Client components.** Interactive UI only — search, infinite scroll, charts, theme toggle. TanStack Query handles server state.

**Stack**
- Next.js 15 (App Router) + TypeScript
- Tailwind CSS + shadcn/ui (Radix primitives, themed)
- Auth.js (NextAuth v5) with custom MusicBrainz OAuth2 provider
- TanStack Query for client-side server state
- Zod for runtime validation of external API responses
- Lucide icons; Recharts/Visx for data viz (decided at `/charts`)

## Data layer

**External sources**
- **ListenBrainz** (`api.listenbrainz.org/1`) — listens, stats, recommendations, playlists, social. Public reads by username; writes need a user token (deferred).
- **MusicBrainz** (`musicbrainz.org/ws/2`) — artist/release/recording metadata. Strict 1 req/sec rate limit; must be proxied through our server with a global token-bucket.
- **CoverArtArchive** (`coverartarchive.org`) — release/release-group cover art with a fallback chain.

**Pattern.** Typed clients in `lib/clients/{listenbrainz,musicbrainz,coverart}.ts`. Each:
- Wraps `fetch` with Zod-validated response parsing.
- Tags responses for surgical revalidation (`lb:user:<name>:listens`, etc.).
- Marked `import 'server-only'` so credentials cannot leak to the client.
- Implements rate limiting where required (MB).

**Caching**
- `revalidate` per endpoint: listens 60s, stats 1h, MB metadata 24h, cover art 7d.
- Tag-based invalidation triggered by user actions.
- ISR for entity pages so popular artists/releases stay warm.

**Client state.** TanStack Query for paginated feeds, search-as-you-type, stat range toggles. Query keys mirror cache tags. No Redux or Zustand.

## Auth

Auth.js with a custom **MusicBrainz OAuth2** provider.

- Authorize: `https://musicbrainz.org/oauth2/authorize`
- Token: `https://musicbrainz.org/oauth2/token`
- Userinfo: `https://musicbrainz.org/oauth2/userinfo`
- Scope: `profile`

JWT session in an HTTP-only cookie. Payload: `mbUsername`, `mbAccountId`, `displayName`, `image`. The MB username **is** the LB username, so `/me` resolves to `/user/[mbUsername]` after sign-in with no extra setup.

`/login` is a single screen with one button: *Continue with MusicBrainz*. No email/password, no separate account creation.

**LB user token (deferred to a later phase).** When write features are added: a `/settings/connections` flow lets users paste their LB token; we encrypt it (libsodium, key from env) and store keyed by `mbAccountId`. Server-side LB writes pull and decrypt the token; it never reaches the client.

**Protected routes.** Middleware checks for session on `/me`, `/settings/*`, and any write-proxy route handler.

## Visual system

**Design language.** Dense and data-rich like last.fm, but with modern restraint: generous line-height, real typographic hierarchy, larger album art at hero moments, calmer color usage. Profile pages should feel like a magazine layout; stats pages should feel like a control panel — same primitives, different rhythm.

**Foundations**
- **Typography.** A workhorse sans for UI (Inter or Geist) paired with an expressive display face for hero moments (candidates: Fraunces, Söhne, Editorial New). Two faces, no more.
- **Color.** Neutral-first (warm near-black, three grays, off-white) plus a single saturated accent borrowed from Parachord so the family resemblance is real but not copy-paste. Dark mode default; light mode supported but secondary.
- **Spacing & grid.** 4px base, 12-column desktop grid, single-column mobile. Cover art at fixed steps (`xs 40 / sm 64 / md 128 / lg 240 / xl 480`).
- **Motion.** Subtle. Hover lifts, smooth list transitions, no parallax.

**Component library.** shadcn/ui as the primitive layer, themed with Achordion tokens. Domain components on top:
- `<ScrobbleRow>`, `<ScrobbleList>`, `<NowPlayingPill>`
- `<ArtistCard>`, `<AlbumCard>`, `<TrackRow>`
- `<StatRangePicker>`, `<TopChart>`, `<ListenHeatmap>`
- `<CoverArt>` (fallback chain, blur placeholder, MBID → CAA URL)
- `<UserBadge>`, `<FollowButton>` (placeholder in v0)

## Page & route inventory

Every route exists in v0 with a layout shell. *Live* = wired to real LB data on day one; the rest are placeholders sharing a `<ComingSoon />` empty state.

**Public**
- `/` — landing (signed-out: marketing + global stats; signed-in: redirect to `/me`) — *live*
- `/login` — MusicBrainz OAuth — *live*
- `/about`, `/donate`, `/changelog` — static
- `/search?q=` — users / artists / releases / recordings — *live*

**User**
- `/user/[name]` — profile + recent listens — *live*
- `/user/[name]/stats`
- `/user/[name]/listens`
- `/user/[name]/charts`
- `/user/[name]/playlists`
- `/user/[name]/pins`
- `/user/[name]/taste`
- `/user/[name]/recommendations`
- `/user/[name]/year-in-music/[year]`
- `/user/[name]/followers`, `/user/[name]/following`
- `/user/[name]/feed` (signed-in self only)

**Entities**
- `/artist/[mbid]` — overview, top tracks, top listeners, similar — *live*
- `/release-group/[mbid]`
- `/release/[mbid]`
- `/recording/[mbid]`

**Explore**
- `/explore` — hub
- `/explore/fresh-releases`
- `/explore/similar-users`
- `/explore/lb-radio`
- `/explore/huesound`
- `/explore/cover-art-collage`
- `/explore/year-in-music`

**Self / Settings (auth-gated)**
- `/me`
- `/settings`, `/settings/connections`, `/settings/import`, `/settings/export`, `/settings/missing-data`

**Playlists**
- `/playlist/[mbid]`

## Repo layout

```
achordion/
  app/
    (marketing)/                  # /, /about, /donate, /changelog
    (auth)/login/
    user/[name]/...
    artist/[mbid]/
    release-group/[mbid]/
    release/[mbid]/
    recording/[mbid]/
    explore/...
    me/
    settings/...
    playlist/[mbid]/
    api/
      auth/[...nextauth]/
      lb/[...path]/               # LB proxy
      mb/[...path]/               # MB proxy (rate-limited)
  components/
    ui/                           # shadcn primitives, themed
    achordion/                    # domain components
    layout/                       # Shell, Header, Sidebar, Footer
  lib/
    clients/                      # listenbrainz.ts, musicbrainz.ts, coverart.ts
    auth/                         # authjs config + MB provider
    cache/                        # tags, revalidation helpers
    types/                        # LB + MB types, Zod schemas
    utils/
  styles/                         # globals.css, tokens
  public/
  docs/                           # design doc + decision records
  tests/                          # Vitest + Playwright later
```

## Phased plan

1. **Phase 0 — Bootstrap.** `create-next-app`, Tailwind, shadcn init, Auth.js with MB provider, base layout shell (header + sidebar + theme toggle), `/` and `/login` rendering. Outcome: clickable shell.
2. **Phase 1 — Skeleton.** Every route above exists with the shared layout, breadcrumbs, and the `<ComingSoon />` empty state. Navigation works end-to-end. Outcome: you can click through the entire app.
3. **Phase 2 — Live pages.** Wire the *live* set: `/`, `/search`, `/user/[name]` (recent listens), `/artist/[mbid]`. LB + MB clients with caching. Outcome: real data on marquee pages.
4. **Phase 3 — Polish + open source.** README, contributing guide, Vercel preview deploy, open the GitHub repo. Outcome: shareable.

**Future phases (post-v0):** stats deep-dives, charts page, LB token + write actions, Achordion-only features layered on LB data.

## Open questions for later phases

- Postgres host once we add tokens (Supabase vs. Neon vs. self-host).
- Charts library decision (Recharts vs. Visx) — defer to `/charts`.
- Whether to ship a public LB API key for unauthenticated rate-limit headroom.
- Search ranking strategy when MB returns many candidates.
