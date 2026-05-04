<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Achordion — agent guide

Companion to [`README.md`](./README.md) (which explains the product). This file covers the conventions, gotchas, and contracts you need to know to work in this codebase without breaking things, plus the contract Parachord agents need to know to keep the two projects in sync.

## What this is

Achordion is **the data view**; [Parachord](https://github.com/Parachord/parachord) is **the player**. Every playable thing here emits a `parachord://` deep link; Parachord wakes (if it isn't running) and plays it. The two projects are designed to feel like one product.

The codebase is a Next.js 16 (App Router) + TypeScript app with Tailwind CSS v4, shadcn/ui, Auth.js v5 (MusicBrainz OAuth), and Zod for external-API runtime validation. **Heed the warning at the top** — read `node_modules/next/dist/docs/` before reaching for an API; this is not the Next.js you know.

---

## Cross-cutting conventions you must follow

### 1. Every artist / album / track name is a click target

Use the helpers in **[`lib/entity-links.ts`](./lib/entity-links.ts)**:

```ts
artistHref({ mbid, name })        // /artist/<mbid>  or  /artist/lookup?name=…
releaseGroupHref({ mbid, artist, title })   // …/release-group/<mbid>  or  lookup
recordingHref({ mbid, artist, title })      // …/recording/<mbid>      or  lookup
```

When an MBID is on hand → direct link. When it isn't → the helper falls through to a click-time **lookup route** (`/artist/lookup`, `/release-group/lookup`, `/recording/lookup`) that searches MusicBrainz and 302s to the canonical entity (with `/search?q=…` as the no-match fallback).

**Never render a name as plain text.** Don't write `recordingMbid ? <Link>…</Link> : t.title` — use the helper. The whole codebase has been swept for this; if you add a new surface, follow the pattern.

### 2. Lookup-at-click, not at render

MusicBrainz allows ≤ 1 request/second. **Never do N MB lookups per render** — that's how the Apple Music chart used to wedge for ~50s of streaming RSC. Resolve at click time via the lookup routes above.

### 3. Two-state Play buttons via shared presence

`lib/use-parachord-presence.ts` is a **module-level singleton** that probes `ws://127.0.0.1:9876` (Parachord's desktop listener) once and pushes state to all subscribers. Any number of `<PlayOnHoverFab>` / `<ParachordCtaButton>` / `<OpenInParachordButton>` / etc. on a page share one connection.

Every "Play" surface has two visual states:

- **Connected** → Parachord brand purple `#8b5cf6`, pulsing green status dot on the CTAs, anchor opens the `parachord://` URL.
- **Not connected** → muted `aria-disabled`, no navigation, custom Tooltip pitches *"Parachord isn't running. **Get Parachord →**"*.

Default render is the disconnected state so SSR/hydration agree; the hook flips it once the WS opens.

### 4. Album grids share `<PlayOnHoverFab>`

Every cover-art grid (Apple Music chart, Earshot Top 50, Top Albums, Fresh Releases, YIM new releases, recording-page "Also appears on", artist Discography, Critical Darlings) wraps its cover in `group relative overflow-hidden rounded-md` and drops `<PlayOnHoverFab>` inside as a sibling of the cover Link. The fab fades in on hover, has its own presence-aware tooltip, and never nests anchors.

### 5. Two tooltip primitives, intentionally

- **`<Tooltip>` / `<TooltipTrigger asChild>` / `<TooltipContent>`** (Radix-based, `components/ui/tooltip.tsx`) — used for **button-shaped triggers**: filter pills, CTAs, hover-fabs, inline play icons.
- **`<IconTooltip label="…">`** (CSS-only, `components/ui/icon-tooltip.tsx`) — used for **anchor-shaped triggers** in icon rows: external-link favicons, Odesli row, "+ Add sources" tile.

Why two? Radix's `<TooltipTrigger asChild>` slot-clone chain resolves to different element types under SSR vs client when a browser extension (Parachord, ad-blockers, dark-readers) mutates anchor attributes. That tree-shape mismatch tears down the whole client tree. `IconTooltip` is pure CSS group-hover — no slot, no JS state, hydration-stable.

### 6. The site nav active-state lives in `components/layout/main-nav.tsx`

`SiteHeader` is async (calls `auth()`); `MainNav` is the client component that uses `usePathname()` for the active-tab highlight. Prefix-match: `/charts/apple-music` lights up the **Charts** tab, etc.

### 7. Breadcrumbs only when there's a real navigable hierarchy

- `/artist/<mbid>` → no breadcrumb (top of the entity tree).
- `/release-group/<mbid>` → `Artist › Album`.
- `/recording/<mbid>` → `Artist › Album › Track`.
- `/playlist/<mbid>` → `Creator › Playlists › <title>`.
- `/explore/recommended-{artists,tracks}` → `Explore › Recommended …`.

Decorative `Section › ThisPage` crumbs are removed across the app. Don't add them back.

### 8. Pure helpers used by both server and client live in `/lib`, never in `"use client"` files

If a server component (`async function Page(...)`) imports a function that lives in a file marked `"use client"`, Next will throw at runtime: *"Attempted to call X from the server but X is on the client."* Re-exporting the function from the client file doesn't help — Next tags any binding sourced from a client module as client-only.

**This applies to *every* export, not just functions.** Constants, label-lookup tables, type re-exports, single-line helpers — if it lives in a `"use client"` file, calling it from a server component throws. Don't be fooled into thinking "it's just a string lookup, it'll be fine." It won't.

**Rule:** any pure, side-effect-free helper or constant consumed on **both** sides of the boundary lives in a non-client module under `/lib`. The client component imports it from there too. See:
- `lib/familiarity.ts` — listen-count thresholds + label helpers used by the explore page server component AND `<FamiliaritySlider>`.
- `lib/entity-links.ts` — `artistHref`/`recordingHref`/`releaseGroupHref` builders used by every server-rendered list AND every client component.
- `lib/radio-modes.ts` — LB Radio mode wire-tokens + display labels used by the server-rendered Station Builder preset chips AND the client `<RadioModeSlider>`.

**Forcing-function:** when you build a new client component that exposes a `RadioMode`-style enum, a helper-from-value, or any preset/lookup table, put it in `/lib` from the start — even before you have a second consumer. The day you add a server-side preset chip / link helper / breadcrumb, you'll already be on the right side of the boundary.

**Transitive imports count too.** Server-only-ness propagates through every module you import, not just the one you typed `import "server-only"` into. If `lib/foo.ts` exports a pure helper *and* a function that imports `lib/clients/musicbrainz.ts` (which is `server-only`), then any client component importing `foo` — even just for the pure helper — pulls the whole chain into the browser bundle, and Next refuses to compile with "You're importing a module that depends on `server-only`."

The fix is to split the file: pure helpers stay client-safe (`lib/foo.ts`), server-only logic moves to a sibling that explicitly imports `server-only` (`lib/foo-server.ts`). Examples:
- `lib/lb-radio-prompt.ts` — `prettifyPrompt` (pure regex+string work, used by client chips).
- `lib/lb-radio-prompt-server.ts` — `resolveArtistNamesInPrompt` (uses `searchArtists` which is `server-only`).

If you find yourself adding `import "server-only"` to a module that already exports a pure helper, that's the signal to split.

### 9. Cover images always go through `<CoverArt>`, never raw `<Image>`

`<CoverArt>` has built-in `onError` swap-to-`Disc3`-placeholder, so a 404 from Cover Art Archive (which is *common* for older / niche releases) never paints the browser's broken-image glyph + alt text. Even when you have a known-good URL, use `<CoverArt>` — the consistency means a downstream API regression doesn't surface as broken images on your page.

### 10. Don't block first paint on slow lookups — paint placeholder, swap in

Wikidata image resolution (artists), MB recording-metadata (track covers), CAA URL resolution (radio rewind tracklists) all involve external round-trips that should never block initial render. The pattern:

1. Server component (or server fetch) returns the page with placeholder identifiers.
2. Client component paints a fast-rendering placeholder (DiceBear avatar, neutral muted square, Disc3 glyph).
3. After mount, client fires a fetch to the appropriate `/api/...` route.
4. On success, swap the placeholder for the real image.

Examples: `<LazyArtistAvatar>` (in search typeahead), `<LazyTrackCover>` (in radio rewind), the artist images that lazy-load in `<SearchTypeahead>` rows.

---

## Browser-extension hydration gotchas

The Parachord browser extension (and other extensions some users run) **mutates anchor attributes between SSR and hydration**. This has caused multiple subtle outage classes:

| Symptom | Cause | Fix |
|---|---|---|
| `<Link>` clicks become no-ops | Extension stamps anchor → React skips wiring `next/link`'s onClick | Use `<button onClick={router.push}>` for nav-style controls (filter pills do this) |
| Tooltip-wrapped anchors throw a hydration error and tear down the client tree | `<TooltipTrigger asChild>` Slot resolves differently on server vs client | Use `<IconTooltip>` (CSS-only) for anchor triggers |
| React duplicate-key warnings | MB sometimes returns the same release-group across pagination boundaries | `getArtistReleaseGroups` dedupes by MBID; member rows use composite keys (`mbid-begin-end-i`) |
| One bad anchor takes down a whole interactive region | Hydration error propagates up to the closest Suspense; client tree regenerates | Add `suppressHydrationWarning` on layout-chrome anchors / use `IconTooltip` for icon rows |

`suppressHydrationWarning` only papers over **attribute / text** mismatches, not tree-shape mismatches. If the server emits a `<button>` and the client emits an `<a>` (which Radix `asChild` slot-cloning can do), suppressHydrationWarning won't help — restructure instead.

---

## Recommendation filtering ("Familiarity" slider)

The Recommended Artists / Recommended Tracks rails on `/explore` (and the dedicated pages under `/explore/recommended-{artists,tracks}`) carry a slider that biases the results between "show me familiar music" and "show me only stuff I haven't heard". The pattern:

- **`lib/familiarity.ts`** — pure module, server-and-client safe. Maps slider values 0–100 (step 10) to a listen-count threshold via 11 buckets. `describeFamiliarity(v, kind?)` returns the human-readable hint text, with `kind` ∈ `"artist" | "track"` for correct copy.
- **`<FamiliaritySlider>`** — client component, takes `param` (URL key), `kind` (artist/track), `label`, `defaultValue`. URL-syncs via `router.replace` on `mouseup` / `touchend` / `keyup`. **Does not** wrap in `useTransition` — the previous UI staying visible during the transition was misread as "the slider does nothing." Eager replace + Suspense skeleton is the right cue.
- **`lib/exclude-listened.ts`** — `buildExcludedArtistSet(username, threshold)` and `buildExcludedRecordingSet(username, threshold)`. Pull top 1000 artists / recordings from LB (the documented per-page max) and return the set of MBIDs whose `listen_count > threshold`.

**Track filtering's reliability gotcha.** `recording_mbid` matches between LB recommendations and the user's listen history are *unreliable* — different release editions / remix MBIDs can refer to the same conceptual track. The MBID-based `exclude` set therefore misses real duplicates. The fix: **also use LB's per-recommendation `latest_listened_at` field**, which is set by LB based on whatever canonicalization their backend uses. So the final filter is: at any non-zero slider value, hide recs with `latest_listened_at !== null` AND hide MBIDs in the listen-count exclude set.

**Suspense keys** on the recommendation sections key on the resolved threshold (`thresholdFromFamiliarity(...)`), not the raw slider value, so within-bucket nudges don't trigger pointless skeleton flashes.

---

## API route caching pattern

For routes that resolve identifiers via expensive external calls (`/api/track-cover`, `/api/artist-image`), the cache stack is layered:

1. **Next data cache** (server, all users) — set by `mbFetch` / `lbFetch` via `next: { revalidate, tags }`. Persistent per deployment.
2. **Browser cache** — set by `Cache-Control: public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400` on the route response. Returning visitors get instant covers from disk for an hour, plus a 24h stale-while-revalidate window where the cached value paints immediately and the server quietly refreshes.

Together: a cover-art URL resolves once per (artist, album) pair globally, and once per browser tab per hour. Cover-art URLs are essentially immutable once known, so a 24h cache is safe.

---

## MusicBrainz client patterns

`lib/clients/musicbrainz.ts` exposes Zod-validated, cache-tagged fetchers. A few patterns to know:

- **`mbFetch`** is the rate-limited fetch wrapper (1 req/sec). Always use it, never raw `fetch` against `musicbrainz.org`.
- **`partitionArtistRelations({ relations })`** splits `url-rels` from `artist-rels`, used everywhere.
- **`categoriseLinks(urls)`** further splits url-rels into `streaming` / `social` / `other`. Filters dead hosts (Google+, Rdio, Vine, Grooveshark, etc. — see `DEAD_HOST_FRAGMENTS`) at the data layer so they never reach any sidebar / row. Streaming goes in the favicon row; other goes in the sidebar's "Other Links."
- **`pickCanonicalRelease(rg)`** picks the **XW (worldwide) release first**, then earliest. MB editors conventionally attach Spotify/Apple url-rels to the XW release because those links apply globally — the album page merges url-rels from both the rg and the canonical release.
- **`searchArtists` / `searchReleaseGroups` / `searchRecordings`** power the lookup routes; quote the name to bias toward exact-phrase matches.
- **`bucketDiscography(groups)`** filters out non-studio secondary types (Compilation, Live, Remix, Soundtrack, Demo, Mixtape, Audio drama, Spokenword, Interview, DJ-mix) and groups Albums / EPs / Singles. The artist page combines Album + EP into a synthetic "Studio" bucket sorted by date for the "Albums + EPs" filter, with `<ReleaseTypeChip>` overlays so users can tell formats apart.

### Streaming favicon row — priority + URL canonicalization

`<ExternalLinks>` (and `<OdesliLinks>`) sort streaming favicons by an explicit priority list: **Bandcamp → Spotify → Apple Music → Tidal → Qobuz → SoundCloud → YouTube Music → YouTube → everything else**. Defined in `STREAMING_HOST_PRIORITY` (`components/achordion/external-links.tsx`). When extending, update both files.

The `href` rendered for Apple Music / iTunes / Spotify URLs is run through `normalizeStreamingUrl`, which strips the country / `intl-XX` path segment so the user's geo gets routed correctly by the destination service rather than getting forced into whichever store the MB editor used.

`<IconTooltip>` shows the friendly site name (X for twitter.com / x.com, MusicBrainz for musicbrainz.org, Bandcamp always uses the canonical favicon regardless of the per-artist subdomain).

---

## Parachord interop contract

This section is for **Parachord agents** modifying the `parachord-desktop` / `parachord-website` / `parachord-browser-extension` codebases who need to keep Achordion in sync.

### What Achordion expects from Parachord

1. **Localhost WS listener** at `ws://127.0.0.1:9876`. Achordion's `useParachordPresence` opens a connection; an `onopen` event = "running", `onclose` = "not running". The presence hook retries on a backoff (5s → 15s → 60s → 5min cap). Achordion does not send any messages over this WS — connection success alone is the signal.
2. **`parachord://` protocol handlers** for the URLs in the table below. PR [#755](https://github.com/Parachord/parachord/pull/755) is the spec source.
3. **No mutation of the user's library** from any URL except `parachord://import?…`.

| Achordion action | URL |
|---|---|
| Play a single track | `parachord://play?artist=…&title=…` |
| Play an album | `parachord://play/album?mbid=…` or `?artist=…&title=…&tracks=<base64>` |
| Play a hosted playlist (XSPF / JSPF) | `parachord://play/playlist?url=…` or `?tracks=<base64>` |
| Play LB Radio | `parachord://play/radio?url=…&refill=…&displayName=…` |
| Listen along | `parachord://listen-along?service=listenbrainz&user=…` |
| Import a playlist | `parachord://import?title=…&creator=…&tracks=<base64>` |
| Open an artist | `parachord://artist/<name>` |
| Queue add | `parachord://queue/add?artist=…&title=…&album=…` |

`<base64>` is UTF-8 base64 of `JSON.stringify(tracks)` where each track is `{ title, artist, album?, duration? }` (duration in **seconds**, not ms — protocol spec).

Helpers in `lib/parachord.ts`. Do not change those URL shapes without coordinating with the Parachord protocol owner.

### What Parachord expects from Achordion

- Achordion never auto-fires a `parachord://` URL. Every link is user-initiated.
- The smart-link pages at `go.parachord.com/<id>` use the same WS contract — Achordion's UX treats Parachord identically.
- The "Get Parachord" disabled-state link points at `https://parachord.com` (constant `PARACHORD_HOMEPAGE` in `parachord-button.tsx` and `play-on-hover-fab.tsx`). If the canonical install URL changes, search both files.

---

## File map (where things live)

### Auth + session
- `auth.ts` — Auth.js v5 config with the custom MB OAuth provider
- `app/(app)/settings/connections/` — token / music-services management

### Top-level routes
- `app/(app)/` — main user-facing surfaces (artist, album, recording, user, charts, radio, explore, feed, search, …)
- `app/(app)/charts/` — sub-tabbed Charts: Apple Music (lazy MBID resolution), Spotify (placeholder), College Radio (Earshot Top 50 with country picker)
- `app/(app)/radio/` — sub-tabbed Radio: Rewinds (default), Builder
- `app/(app)/explore/` — Overview / Year-in-Music / Critical Darlings / Fresh Releases
- `app/api/` — internal API routes:
  - `search/` — typeahead JSON endpoint (artists/albums/songs/users + popularity sort + `artist:` `album:` `song:` `user:` power filters)
  - `track-cover/` — `(artist, title, album)` → CAA URL resolver for radio rewinds
  - `artist-image/` — MBID → Wikidata-hosted thumbnail for typeahead artist rows
  - `playlist/[mbid]/xspf/` — XSPF export
- `app/{artist,recording,release-group}/lookup/route.ts` — click-time MBID resolvers (outside the (app) group on purpose, since they 302 elsewhere)

### Data clients
- `lib/clients/musicbrainz.ts` — MB read API + search, Zod schemas, rate-limited `mbFetch`
- `lib/clients/listenbrainz.ts` — LB API: listens, stats, feedback, playlists, fresh releases, LB Radio, YIM, feed, popularity
- `lib/clients/odesli.ts` — song.link cross-service link lookup, cached 24h, 10 req/min ceiling
- `lib/clients/coverart.ts` — Cover Art Archive URL builders + listen → CAA URL helper
- `lib/clients/earshot.ts` — Canada NCRA chart scraper (with cover-art resolver)
- `lib/clients/apple-charts.ts` — Apple Music RSS chart feeds
- `lib/clients/wikidata.ts` — artist photo P18 → upload.wikimedia.org
- `lib/clients/critical-darlings.ts` — editorial RSS feed parser

### Helpers
- `lib/entity-links.ts` — **the** way to render a name as a link
- `lib/parachord.ts` — `parachord://` URL builders, protocol-spec aligned
- `lib/use-parachord-presence.ts` — singleton WS presence hook
- `lib/familiarity.ts` — slider value → listen-count threshold (server + client safe)
- `lib/exclude-listened.ts` — `buildExcludedArtistSet` / `buildExcludedRecordingSet` for recommendation filtering
- `lib/dicebear-shapes.ts` — generated avatar palette (deliberately non-violet so it doesn't fight the Parachord-purple Play CTAs)
- `lib/apple-charts-countries.ts`, `lib/college-charts-countries.ts` — country pickers

### Components
- `components/ui/` — shadcn primitives + custom `tooltip.tsx`, `icon-tooltip.tsx`
- `components/achordion/` — application components (track lists, charts grids, sidebars, hero cards, etc.). Notable patterns:
  - `play-on-hover-fab.tsx` — universal album-grid hover play button
  - `parachord-button.tsx` — `<ParachordCtaButton>`, `<ParachordPlayButton>`, `<PlayOverNumberCell>`
  - `open-in-parachord-button.tsx` — playlist / radio / import variants
  - `artist-credit-links.tsx` — multi-artist credit with preserved join phrases
  - `release-type-chip.tsx` — Album/EP overlay for mixed-type album grids
  - `add-sources-button.tsx` — "+" tile linking to MB `/edit` page
  - `familiarity-slider.tsx` — recommendation-rail strictness control
  - `search-typeahead.tsx` — live search with `latest_listened_at` + popularity sort
  - `lazy-track-cover.tsx` — non-blocking CAA cover-art lookup for radio rewinds
- `components/layout/` — site header, main nav, wordmark, theme toggle, footer
- `components/providers/` — Theme / Query / Tooltip providers (one mount of `TooltipProvider` for the whole app)

---

## Codebase smells / things to never do

1. **Don't add `<Link>` for nav-style controls that have to work despite extensions.** Use `<button onClick={router.push}>` (see filter-pills.tsx).
2. **Don't render an artist/album/track name as plain text** — even in fallback branches. Use the helpers.
3. **Don't `<TooltipTrigger asChild>` an `<a>`** — use `<IconTooltip>`. Other element types are fine.
4. **Don't fetch MB at render time per-row.** Use lookup routes.
5. **Don't open a fresh WebSocket per component.** The presence singleton handles it.
6. **Don't add per-card `Suspense` to chart grids.** That was a workaround for per-card MB lookups, which we removed in favor of click-time resolution.
7. **Don't reach for native browser `title=` tooltips** unless you genuinely have no other option. Both tooltip primitives are available; pick the right one.
8. **Don't bypass `mbFetch`** for MusicBrainz calls — the rate limit is real, and the cache tags matter.

---

## Workflow notes

- `npm run dev` for local. The dev server uses Turbopack.
- **Typecheck before committing:** `npx --no-install tsc --noEmit`. The project ships TS strict.
- **Lint:** `npx --no-install eslint <files>`.
- Commits follow a focused-and-themed style — see `git log --oneline` for the cadence. Subject lines describe what the user-facing change does, not the implementation.
- Do not amend commits unless explicitly requested.
- Production deploy is Vercel from `main`; the WS-to-localhost approach works in production because Chrome / Edge / Firefox treat `ws://127.0.0.1` as a "potentially trustworthy origin" exception from mixed-content blocks.
