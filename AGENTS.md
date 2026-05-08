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

**Albums always link to release-GROUP, never to a release.** A release group is the abstract album entity ("Sgt. Pepper's"); a release is one specific edition (mono UK '67, stereo Japan '92, 50th-anniversary deluxe '17 — different MBIDs). Catalog data sources hand back both: MusicBrainz returns release-group MBIDs alongside release MBIDs, ListenBrainz feeds + LB Radio return release MBIDs only. Always group/normalize at the release-group level for click targets. When a data source only gives you a release MBID, look up the release group via `getRecordingMetadata` (LB) or `getRelease` (MB) — don't link to `/release/<mbid>` and "let the page resolve it." The only place `/release/<mbid>` is acceptable is the genuine fallback when the source has truly no release-group MBID even after lookup, which should be vanishingly rare. The release page itself exists for completeness and is reachable via "Other editions" lists.

### 2. Lookup-at-click *or* piggyback on the cover-art lookup — never N synchronous MB calls per render

MusicBrainz allows ≤ 1 request/second. **Never do N MB lookups per render** — that's how the Apple Music chart used to wedge for ~50s of streaming RSC. Two acceptable patterns:

**(a) Click-time lookup** — `releaseGroupHref({artist, title})`, `artistHref({name})`, `recordingHref({artist, title})` produce `/release-group/lookup?…` etc. The user's click triggers one server-side MB search + 302. Cheap on first paint, slightly slower on click.

**(b) Piggyback on the cover-art lookup** (the better choice anywhere `<LazyAlbumCover>` / `<LazyTrackCover>` is already firing). `/api/track-cover` returns `{ url, mbid }` — the resolved release-group MBID rides along with the cover URL at no extra MB cost. The lazy components expose this via an `onResolved({url, mbid})` callback. Capture it in a `useState` and swap the album href from the lookup fallback to a direct `/release-group/<mbid>` once it arrives.

```tsx
const [resolvedMbid, setResolvedMbid] = useState<string | null>(null);
const albumHref = resolvedMbid
  ? `/release-group/${resolvedMbid}`
  : releaseGroupHref({ artist, title });

<LazyAlbumCover
  artist={artist}
  album={title}
  alt={title}
  initialSrc={inlineCover}
  onResolved={({ mbid }) => mbid && setResolvedMbid(mbid)}
/>
```

**When to choose which:**
- Cover lookup is already firing for cover art (NACC, !earshot, Critical Darlings, Radio Rewinds, LB Sitewide fallback) → use (b). The MBID is a free byproduct. Surfaces that already pay the MB cost shouldn't pay it again on click.
- Cover lookup is **not** otherwise firing (Apple Music — ships its own artwork URL) → trade-off: opt into (b) only if the page's expected click-through rate justifies adding N MB calls per cold-cache page load. The Apple Music chart pages opted in (50 calls per cold visit, cached 1h, faster album clicks). For lower-engagement surfaces, (a) is fine.
- Source already supplies the MBID (LB sitewide top-release-groups, LB playlist tracks via `release_mbid`) → use the MBID directly, no lookup needed. Only fall through to (b) for the rare missing-MBID entry.

**Don't add (b) on top of (a) when LB already provides the MBID.** Pass the existing MBID into `*Href` and the helper returns a direct URL. The lookup-href fallback is for cases where neither the source nor the cover-resolver has produced an MBID yet.

### 3. Two-state Play buttons via shared presence

`lib/use-parachord-presence.ts` is a **module-level singleton** that probes `ws://127.0.0.1:9876` (Parachord's desktop listener) once and pushes state to all subscribers. Any number of `<PlayOnHoverFab>` / `<ParachordCtaButton>` / `<OpenInParachordButton>` / etc. on a page share one connection.

Every "Play" surface has two visual states:

- **Connected** → Parachord brand purple `#7c3aed`, pulsing green status dot on the CTAs, anchor opens the `parachord://` URL.
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

**Props from server → client must be plain serializable values, not component references.** When a server component (`<SiteHeader>`, any `async` page) passes data into a client component (`<MainNav>`, `<RadioModeSlider>`), every prop crosses the RSC serialization boundary. **Plain JSON-ish data is fine; React elements (already-rendered JSX like `<Search />`) are fine; *component classes / function refs are not*.** Passing a Lucide icon as `icon: Search` will throw at runtime:

> *Only plain objects can be passed to Client Components from Server Components. Classes or other objects with methods are not supported.*  
> `{href: "/search", icon: {$$typeof: ..., render: ...}}`

**Fix:** pre-render the element on the server side and pass *the element*. The prop type is `React.ReactNode`, not `LucideIcon` / `ComponentType`.

```tsx
// ❌ Server passes a component class — breaks serialization
<MainNav extras={[{ label: "Search", icon: Search }]} />

// ✅ Server pre-renders the JSX; element serializes fine
<MainNav extras={[{ label: "Search", icon: <Search className="size-4" /> }]} />
```

Same rule applies to function props (callbacks), Map/Set instances, Date objects with custom prototypes, and class instances — none of those cross. Strings, numbers, plain objects, arrays, and JSX elements do.

### 9. Cover images always go through `<CoverArt>`, never raw `<Image>`

`<CoverArt>` has built-in `onError` swap-to-`Disc3`-placeholder, so a 404 from Cover Art Archive (which is *common* for older / niche releases) never paints the browser's broken-image glyph + alt text. Even when you have a known-good URL, use `<CoverArt>` — the consistency means a downstream API regression doesn't surface as broken images on your page.

`<CoverArt>` also handles the **300ms ease-out load fade**. So does `<LazyAlbumCover>` (full-bleed tiles), `<FadeInImage>` (drop-in for raw `<Image>` when CoverArt's shape doesn't fit — e.g. Apple Music's inline `artworkUrl`), and `<AvatarImage>` (artist / user avatars, fades in via `animate-in fade-in duration-300` since base-ui only mounts the `<img>` once loaded). Use one of these for **every async image surface** so the whole app's image swaps share the same calm motion vocabulary. Don't introduce raw `<Image>` for cover art / artwork without one of them wrapping it.

### 10. Never abbreviate ListenBrainz / MusicBrainz / MetaBrainz in user-facing copy

In code comments, identifiers, and internal docs, "MB" / "LB" are fine shorthand. **In any string a user could read** — page copy, headings, button labels, alt text, metadata titles, error messages, feature-flag descriptions — write the brand names out in full: **ListenBrainz**, **MusicBrainz**, **MetaBrainz**. New users have no idea what "LB Radio" or "the MB artist page" means; the friction is real.

Exceptions, both narrow:

- **MBID** is the canonical term for a MusicBrainz Identifier and appears that way in MetaBrainz's own docs. Leave it.
- **ISRC** / **ISWC** / **EAN** are industry standards, not abbreviations of our own. Leave them.

If you're tempted to write "LB" or "MB" anywhere a user could see it, expand it. If the sentence reads awkwardly with the full name twice, restructure rather than abbreviate.

### 11. Don't block first paint on slow lookups — paint placeholder, swap in

Wikidata image resolution (artists), MB recording-metadata (track covers), CAA URL resolution (radio rewind tracklists) all involve external round-trips that should never block initial render. The pattern:

1. Server component (or server fetch) returns the page with placeholder identifiers.
2. Client component paints a fast-rendering placeholder (DiceBear avatar, neutral muted square, Disc3 glyph).
3. After mount, client fires a fetch to the appropriate `/api/...` route.
4. On success, swap the placeholder for the real image, **and surface the resolved MBID** (rule #2 path b) so the row's links stop rounding-tripping through `/release-group/lookup` on click.

Examples: `<LazyArtistAvatar>` (in search typeahead), `<LazyTrackCover>` / `<LazyAlbumCover>` (radio rewinds, charts), the artist images that lazy-load in `<SearchTypeahead>` rows. The lazy cover components both expose an `onResolved({ url, mbid })` callback. When LB / source data didn't already ship the MBID, capture it via `useState` and use it for the album href + Parachord play target. See `CollegeAlbumCard`, `RadioRewindRow`, `ChartsAlbumCard` (Apple Music) for the canonical implementations.

### 12. CSS Grid tracks need explicit `min: 0` or they overflow on mobile

Bug class that bit us repeatedly: a long playlist title or annotation pushed cards past the viewport on mobile, even with `truncate` + `min-w-0` + `flex-1` correctly applied to the inner H3.

The cause is a CSS-spec default that's surprising:

- **`display: grid` with no `grid-template-columns`** falls back to a single auto-sized column. That column tries to size to its content's max-content.
- **Grid items default to `min-width: auto`** — they refuse to shrink below their content's *min-content* (= the longest unbreakable word). The track inherits this and refuses to shrink with them.
- **`grid-cols-[1fr_280px]`** has the same trap. Bare `1fr` is `minmax(auto, 1fr)`, and `auto` triggers the same min-content floor.

Result: a playlist card with a long title makes the grid track expand past the viewport, dragging every child along even though `truncate` is set up correctly inside.

**Rule:** every grid layout that renders user-supplied text needs `minmax(0, ...)` (or Tailwind's `grid-cols-N` shorthand which already wraps `minmax(0, 1fr)`) on every track that holds variable-width content.

```tsx
// ❌ Auto-sized track. Long content pushes the grid wider than viewport.
<div className="grid gap-3 md:grid-cols-2">

// ✅ Explicit single-column on mobile, two-column at md+.
<div className="grid grid-cols-1 gap-3 md:grid-cols-2">

// ❌ Bare `1fr` has min-width: auto by default.
<div className="grid lg:grid-cols-[1fr_280px]">

// ✅ minmax(0, 1fr) lets the track shrink past intrinsic content.
<div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px]">
```

Belt-and-suspenders helpers for cards that wrap variable-width content:

- **`min-w-0`** on flex containers that wrap a flex child with `truncate` (so the flex child can actually shrink below its min-content).
- **`overflow-hidden`** on the card's outer surface as a final cap — even if the inner layout misbehaves, content gets visually clipped at the card boundary instead of pushing the card past its column.

The mass fix landed in commit 611e2ba sweeps every page with this bug. **If you add a new grid layout that holds entity names, playlist titles, or any user-supplied text, follow the explicit-`minmax(0, ...)` pattern from the start.**

### 13. Every layout must work on mobile

Achordion is used as much on phones as on laptops. **No change ships without a mobile pass.** When you add or modify any layout, resize the viewport to <640px (or use the device toolbar) and confirm it doesn't overflow, stack weirdly, or hide content behind fixed chrome.

Concrete rules that cover the cases that have actually broken:

- **Flex rows that pack 3+ children must stack on small.** Default to `flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6`. The user-page-header row originally packed avatar + name + follow + radio widget into one always-horizontal row and elbowed the username block on every viewport between phone and laptop.
- **Right-aligned widgets in a header row should never have a fixed width that exceeds their share of the container at common mobile widths.** `w-72 max-w-[80vw]` is fine; combined with a non-stacking flex row it isn't.
- **Absolute-positioned dropdowns / popovers need an explicit z-index that's actually in the Tailwind bundle.** `z-10`, `z-40`, `z-50` are emitted by default; one-offs like `z-30` may or may not survive a dev cache hiccup. If your panel ends up rendering behind sibling content, computed `z-index: auto` is the smoking gun. Stick to the emitted set unless you've verified.
- **Cap pill / chip widths or use `truncate` + `min-w-0`.** Long track / artist / playlist names are the common cause of mobile overflow. The on-air pill's lesson: `max-w-[220px]` (or any single-class width cap) is more robust than `hidden ... sm:inline-flex` gating because the latter relies on a class Tailwind may or may not have scanned.

If you can't actually preview at narrow widths in your environment, at minimum read the JSX and confirm every horizontal layout has either a stacking variant, a truncating child, or both.

### 14. Touch / coarse-pointer affordances

Every hover-revealed UI is invisible on touch. Tailwind 3.5+ gates `hover:` rules behind `(hover: hover)`, so `opacity-0 group-hover:opacity-100` patterns never fire on phones. The standard fix is the `pointer-coarse:` variant — same modifier the existing play family uses now:

```tsx
// Hover reveal (cursor only) + always-visible on touch
className="opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100"
// Bigger on touch so hit area clears the 44px tap-target floor
className="size-7 pointer-coarse:size-9"
```

Concrete rules:

- **Don't hide primary actions behind hover.** Play buttons, follow buttons, action menus, "+" tiles — anything actionable — must have a visible coarse-pointer fallback. The four play affordances (`PlayOnHoverFab`, `ParachordPlayButton`, `PlayOverNumberCell`, `PlayOverCover`) follow this pattern; new ones should mirror it.
- **Tap targets ≥ 44 CSS px on coarse pointers.** Use `pointer-coarse:size-9` / `pointer-coarse:size-11` to grow icon-only buttons. For tightly placed icons that can't grow visibly, expand the hit area via `pointer-coarse:before:absolute pointer-coarse:before:-inset-2`.
- **Tooltips don't replace labels on touch.** Hover-only `<Tooltip>` and `<IconTooltip>` are decorative on phones. Always set `aria-label` on the trigger so screen readers + voice control still work, and promote text out of the tooltip when the label carries actual user-facing info ("Listen along", platform names, etc.).
- **Hover-toggled disclosures must also support tap.** No "popover that only opens on hover" — Base UI menus and Radix dropdowns already handle both, but custom CSS-hover panels need an explicit click handler.
- **Don't lean on `cursor-pointer` for affordance.** Touch users never see cursors; if a thing isn't a `<button>` / `<a>`, it isn't keyboard-focusable either, which hurts both touch and a11y.

`useParachordPresence` short-circuits to `true` on coarse pointers (see `lib/use-parachord-presence.ts`) — phones can't reach the desktop WebSocket listener, so we trust the OS to handle the parachord:// deep-link instead. New play surfaces inherit this for free; don't try to gate them behind a separate "is mobile?" check.

---

## Browser-extension hydration gotchas

The Parachord browser extension (and other extensions some users run) **mutates anchor attributes between SSR and hydration**. This has caused multiple subtle outage classes:

| Symptom | Cause | Fix |
|---|---|---|
| `<Link>` clicks become no-ops | Extension stamps anchor → React skips wiring `next/link`'s onClick | Use `<button onClick={router.push}>` for nav-style controls (filter pills do this) |
| Tooltip-wrapped anchors throw a hydration error and tear down the client tree | `<TooltipTrigger asChild>` Slot resolves differently on server vs client | Use `<IconTooltip>` (CSS-only) for anchor triggers |
| React duplicate-key warnings | MB sometimes returns the same release-group across pagination boundaries | `getArtistReleaseGroups` dedupes by MBID; member rows use composite keys (`mbid-begin-end-i`) |
| One bad anchor takes down a whole interactive region | Hydration error propagates up to the closest Suspense; client tree regenerates | Add `suppressHydrationWarning` on layout-chrome anchors / use `IconTooltip` for icon rows |
| Random dev-only CSS / runtime breakage (`SES Removing unpermitted intrinsics` in console) | A wallet extension (MetaMask / similar) injects SES, which strips `eval` / `Function`. Next 16 dev (Turbopack HMR + Tailwind v4 dev pipeline) uses both, so module / CSS hot updates partially fail. Production isn't affected — it ships pre-compiled. | Disable the extension or test in incognito; don't chase it as a code bug. |

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

## Content-Security-Policy

`next.config.ts` ships an **enforcing** Content-Security-Policy via the `CSP` constant — full directive set (default-src / script-src / style-src / connect-src / img-src / font-src / frame-src / frame-ancestors / object-src / base-uri / form-action / upgrade-insecure-requests). The allowlist is inventoried from the codebase: every external host the app intentionally talks to (LB, MB, Wikidata, Wikipedia, CAA, archive.org family, DiceBear, Odesli, RSS / Earshot / Spinbin, Apple Music CDN, Google s2 favicons, Vercel telemetry, the localhost Parachord WS) is named.

**When adding a new external API / image source / favicon CDN, extend the right CSP directive in `next.config.ts`** — otherwise the request gets blocked outright (no more report-only safety net) and the page silently misses content / functionality.

The smoke suite at `tests/e2e/` catches the gross-regression case (own-origin failures + console errors), so a missed allowlist that breaks rendering surfaces as a red CI run on the PR that introduced it. For a soft rollout when adding a particularly risky new directive, swap `key: "Content-Security-Policy"` to `key: "Content-Security-Policy-Report-Only"` for one deploy, walk the routes again, then re-flip.

## Feature flags

`lib/flags.ts` gates new surfaces behind a runtime allowlist so we can dogfood / canary in production without redeploying. Identity is the MusicBrainz username from the Auth.js session (`session.user.mbUsername`). Logged-out users are never on an allowlist — only flags whose default is `on` reach them.

**Usage from a server component / page:**

```ts
import { isFeatureEnabledForViewer } from "@/lib/flags";
import { FeatureFlag } from "@/components/achordion/feature-flag";

// Imperative — branch on the flag:
if (await isFeatureEnabledForViewer("reviews")) { … }

// Declarative — wrap the gated surface:
<FeatureFlag flag="reviews"><AlbumReviews mbid={mbid} /></FeatureFlag>
```

`isFeatureEnabled(flag, user)` is also exported when you need to gate by an explicit username (e.g. an API route that already has the session in hand).

**Resolution order (first match wins):**

1. Redis `GET flag:<name>:default` = `"on"` → enabled for everyone (rollout / kill-switch override-on).
2. Redis `GET flag:<name>:default` = `"off"` → disabled for everyone (kill switch).
3. Redis `SISMEMBER flag:<name>:users <mb-username>` → enabled for that user (allowlist).
4. Default → disabled.

**Local-dev fallback when Upstash isn't configured** — the same resolution but against env vars: `FEATURE_<NAME>` ∈ `"on"|"off"` and `FEATURE_<NAME>_USERS` (comma-separated list).

**Admin ops** — run against the same Upstash database that backs the MB rate limiter (Upstash console "CLI" tab, `redis-cli --tls -u …`, or the REST API):

```redis
SADD flag:reviews:users alice bob   # add to allowlist
SREM flag:reviews:users alice       # remove
SET  flag:reviews:default on        # ship to everyone
SET  flag:reviews:default off       # kill switch
DEL  flag:reviews:default           # back to allowlist mode
```

The helper is per-request memoized via React `cache()` (so multiple checks on one render share one Redis round trip), but **not** cached across requests — a flag flip takes effect on the very next page load. No CDN cache invalidation needed.

**When to add a flag:** any user-facing surface that you want to dogfood for a few days before opening up, any feature that depends on an external API whose stability is unproven (so you can kill the surface fast without a deploy), and anything you'd want to A/B test later. **When not to:** internal refactors, bugfixes, or changes you'd never want to dark-launch — those should ship unconditionally.

**Active flags:**

| Flag | What it gates |
|---|---|
| `reviews` | The Reviews section on `/release-group/<mbid>` (CritiqueBrainz reviews + Wikipedia "Critical reception" fallback). |
| `write_reviews` | The inline write-a-review form on the same album page; posts to CritiqueBrainz via the OAuth flow under `app/api/critiquebrainz/`. Requires `AUTH_CRITIQUEBRAINZ_ID` / `_SECRET` to be configured. The server action also re-checks this flag, so flipping the flag off mid-session blocks new submissions even from clients that already had the form rendered. |

---

## Tag-voting blocklist

Tag voting + add-tag is OPEN to every signed-in user — this is community-driven classification, gating it behind allowlists defeats the purpose. But every open vote system attracts the occasional bad actor (spammy tags, downvote campaigns, slurs in custom tag names). The blocklist at `lib/tag-blocklist.ts` is the moderation lever.

Storage is a Redis set at key `tag:blocked:users` containing the MB usernames (case-sensitive) of blocked users. The check is enforced in `app/api/musicbrainz/[entity]/[mbid]/tags/route.ts` before any MB call — blocked users get a vague 403 ("tag voting is unavailable for this account") so they can't probe for the reason. Their existing votes on MB stay untouched (we don't have authority to retract them upstream).

Admin ops via Upstash CLI:
```
SADD     tag:blocked:users alice bob
SREM     tag:blocked:users alice
SMEMBERS tag:blocked:users
DEL      tag:blocked:users        # clear everyone
```

Env-var fallback for local dev (when Upstash isn't configured): `TAG_BLOCKLIST=alice,bob` in `.env.local`. Comma-separated MB usernames. Lets us hit the blocked-user code path without standing up Redis.

When triggering blocks, prefer the lightest touch — most "polluting" tag activity is fixed by reverting MB's tag votes manually rather than blocking the user. Reach for the blocklist when MB-side cleanup isn't keeping up.

---

## Auth-gated content on edge-cached routes (client-island pattern)

Public entity routes (`/release-group/:mbid`, `/artist/:mbid`, `/recording/:mbid`, `/charts/*`, `/about`, `/faq`, etc.) carry a shared `CDN-Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400` header (see `PUBLIC_ENTITY_CACHE` in `next.config.ts`). The Vercel edge serves a single SSR'd response to every visitor for an hour, refreshing in the background — the entire reason these pages feel instant.

That cache is **shared across all visitors**, so any server-rendered output that depends on the session cookie or a per-user flag would either (a) leak personalized content to anonymous viewers (if your render hit the cache as a logged-in allowlisted user) or (b) hide that content from real users (if the first render was anonymous). Both modes are bugs.

**The pattern: render auth-gated sections as a client island that fetches a `private, no-store` API.**

Worked example for the Reviews block (`flag:reviews` / `flag:write_reviews` on `/release-group/:mbid`):

1. **Server page** (`app/(app)/release-group/[mbid]/page.tsx`) renders the public surface only and mounts `<AlbumReviews mbid={mbid} />` unconditionally — no flag check, no auth read at the page level. The page output is identical for everyone, so the edge cache stays valid.
2. **Server-component shell** (`components/achordion/album-reviews.tsx`) is a one-liner that imports the client island. Server-only files (CB client, flags, cb-token) never get pulled into a `"use client"` graph this way.
3. **Client island** (`components/achordion/album-reviews-client.tsx`) is `"use client"`, uses `useQuery` against `/api/release-group/[mbid]/reviews`, renders a skeleton while loading, nothing on error/empty, the actual content otherwise. SWR-style cache settings: `staleTime: Infinity`, `refetchOnWindowFocus: false` — reviews shift slowly.
4. **Per-user API** (`app/api/release-group/[mbid]/reviews/route.ts`) does `isFeatureEnabledForViewer()`, `auth()`, and the upstream data fetches. Marked `dynamic = "force-dynamic"` and explicitly `Cache-Control: private, no-store, max-age=0, must-revalidate` — never CDN-share a per-user payload, even briefly.

When adding a new auth-gated section to any cached route, copy this four-piece structure. Don't put `auth()` or `isFeatureEnabledForViewer()` in a server component on a cached route — that breaks the cache split. Don't pass the personalized state through props from the page either; the JSX shape needs to be byte-identical between viewers for the edge cache to hit.

Out-of-scope cases (do NOT use this pattern):
- Routes that aren't in `PUBLIC_ENTITY_CACHE` (`/feed`, `/u/[name]`, `/user/[name]/*`) — those are already per-user, regular server components are fine.
- Auth state that's just *displayed* in the header / nav — that's already client-side via `useSession()`.

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

### LB Radio handoff: pre-fetched pool + refill, not raw prompt

`parachord://play/radio?prompt=…` (Mode B) is the wrong tool for any "play this user's radio" affordance. Parachord's prompt mode falls through to its in-app spinoff seed when LB rejects the input — and LB *will* reject anything malformed, returning silent 0-track stations.

The shape that actually plays music is **Mode C-inline**:

```
parachord://play/radio?tracks=<base64-of-initial-pool>&refill=<lb-radio-api-url>&name=<displayName>
```

Pattern:

1. Build the LB Radio prompt per [Troi's syntax](https://troi.readthedocs.io/en/latest/lb_radio.html). For stats: **`stats:<user>::<range>`** (double colon before range). Other mode prefixes: `tag:(...)`, `country:(...)`, `artist:(...)`, `artist:(<mbid>)`.
2. Fetch the initial 50-track pool server-side via `tryGetLbRadio(prompt, mode)` (in `lib/clients/listenbrainz.ts`). The LB token is server-only, so client widgets that need this must call the proxy route at **`/api/lb-radio?prompt=…&mode=easy`** (returns `{ tracks: ParachordTrack[] }`).
3. Hand Parachord both `tracks=` (immediate playback) and `refill=https://api.listenbrainz.org/1/explore/lb-radio?prompt=…&mode=easy` (so it can extend with the user's local LB token when the pool runs low).

Reference implementations: server-side, `LbRadioSection` (used on `/radio` and the user-radio rails). Client-side with a click-time fetch, `UserStatsRadioWidget` (range slider drives a different prompt per click).

Don't try to use `parachord://play/radio?url=<lb-radio-api-url>` (Mode C, URL-only) for LB Radio — Parachord's URL-pool path expects a static playlist, not an LB-Radio JSPF endpoint that needs a token. Always pre-fetch and inline.

### Mobile (iOS / Android) — Universal Links + App Links

The desktop WS-presence story doesn't translate to phones: Parachord-mobile is a sandboxed app, not a process running a localhost listener, and iOS/Safari blocks `ws://127.0.0.1` from web pages anyway. So `useParachordPresence` short-circuits to `true` on `(pointer: coarse)` clients and trusts the OS to dispatch the deep-link.

For that trust to be earned, **Parachord-mobile needs to register Universal Links (iOS) and App Links (Android)** for every `parachord://` URL shape Achordion produces:

- **iOS — Universal Links**
  - Pick a host you control for the universal version of the protocol — typically `https://parachord.com/play`, `https://parachord.com/play/album`, `https://parachord.com/listen-along`, etc., one path per protocol verb. Mirror the existing `parachord://` query-string shape verbatim so the same URL works in both forms.
  - Host an `apple-app-site-association` (AASA) JSON at `https://parachord.com/.well-known/apple-app-site-association` with the app's team-id-prefixed bundle ID and the path patterns above. No file extension; served as `application/json`; no redirect.
  - In the iOS app's entitlements, add `com.apple.developer.associated-domains = applinks:parachord.com`.
  - Implement `application(_:continue:restorationHandler:)` (UIKit) or the SwiftUI `onOpenURL` / `onContinueUserActivity(type: NSUserActivityTypeBrowsingWeb, ...)` handler to receive the inbound URL and route it the same way the `parachord://` scheme handler does.
  - **Fallback for users without the app installed:** the Universal-Link host page (`https://parachord.com/play?…`) should server-render a "Get Parachord" pitch with the destination context (track name, etc.) preserved. iOS only opens the app when the AASA permits the path *and* the app is installed; otherwise Safari renders the URL — meaning a not-installed user lands on a useful page instead of an OS error.

- **Android — App Links**
  - Same idea, different ceremony. Add `<intent-filter android:autoVerify="true">` for each Universal-Link path host on the activity that handles the deep link. Host the matching `assetlinks.json` at `https://parachord.com/.well-known/assetlinks.json` with the app's package name + signing-cert SHA-256 fingerprint.
  - Verified App Links open the app directly without the OS chooser; an unverified or unmatched path opens the URL in the user's default browser, again landing on the install pitch.

- **Custom-scheme fallback** (`parachord://...`) should keep working as today — it's still useful from contexts that don't go through a browser (in-app webviews, share sheets). On iOS in particular, `parachord://` URLs invoked from within Safari are subject to the same OS dialog ("Cannot Open Page") when the app isn't installed; that's why the Universal-Link form is preferred from web pages and we keep `parachord://` for app-to-app deep linking.

If those pieces are in place, Achordion's mobile UX needs **no further changes** — every play surface taps a `parachord://` URL, the OS routes it to the app or the web fallback, and the user either plays the track or gets pitched on installing.

If they aren't yet:
- Tapping a play affordance on mobile from a non-installed user opens the OS's "Cannot Open Page" alert (iOS) or does nothing visible (Android).
- The `parachord://` URL is still valid for installed users — they get correct behaviour.
- We accept that as a bridging trade-off; the install pitch lives at the homepage / `/apps` Marketplace until the Universal-Link path is live.

### What Parachord expects from Achordion

- Achordion never auto-fires a `parachord://` URL. Every link is user-initiated.
- The smart-link pages at `go.parachord.com/<id>` use the same WS contract — Achordion's UX treats Parachord identically.
- The "Get Parachord" disabled-state link points at `https://parachord.com` (constant `PARACHORD_HOMEPAGE` in `parachord-button.tsx` and `play-on-hover-fab.tsx`). If the canonical install URL changes, search both files.
- On `(pointer: coarse)` clients we render every play surface as Parachord-present-by-default — assume installed, deep-link through the OS. Don't add a separate "is mobile?" check inside individual components; piggyback on `useParachordPresence` which handles the gate centrally.

### Track-links submission (POST `/api/track-links/submit`)

Parachord can push confirmed-on-playback MBID → external-streaming-URL matches into Achordion's persistent links cache. Each submitted link is stored with `source: "parachord"`, which outranks the Odesli + MB lookups Achordion does itself — so the next user who clicks the favicon row sees the playback-verified URL, not Odesli's best-effort match. Works for both **recordings** (per-track URLs) and **release-groups** (per-album URLs).

- **Auth:** bearer token. Achordion reads `PARACHORD_TRACK_LINKS_TOKEN` from its env; Parachord side configures the matching value and presents `Authorization: Bearer <token>` on every request.
- **Endpoint:** `POST https://achordion.xyz/api/track-links/submit` (or `localhost:3000/api/track-links/submit` for dev).
- **Body:**
  ```json
  {
    "mbid": "<entity-mbid>",
    "entity": "recording",
    "links": [
      { "url": "https://open.spotify.com/track/...", "label": "Spotify", "host": "spotify.com" },
      { "url": "https://music.apple.com/...", "host": "music.apple.com" }
    ],
    "trackName": "Song Title",
    "artistName": "Artist Name",
    "albumName": "Album Name"
  }
  ```
  - `entity` (optional, default `recording`):
    - `recording` (alias `track`) — per-track URLs (Spotify track links etc.). Cached under recording.
    - `release-group` (alias `album`) — per-album URLs. Cached under release-group.
    - `release` — per-album URLs against a *specific edition* MBID. Achordion looks up the release in MB and redirects the cache write to its parent release-group; the response's `stored_as` field surfaces the resolved release-group MBID so Parachord can update its own mapping if useful.

    The two storage entity types (`recording` and `release-group`) use separate cache namespaces so MBIDs can't collide.
  - `label` and `host` are optional — Achordion derives `host` from the URL and capitalises the second-level domain when missing. `trackName` / `artistName` / `albumName` are also optional but encouraged: they make the stored cache entry self-describing (so admins can scan keys without an MB roundtrip to identify what each entry is) and unlock future search-by-name features over the cache.
- **Response:** `200 { ok: true, accepted: <n>, stored_as: { entity, mbid } }` on success — `stored_as` echoes the storage key Achordion actually used (matters when `entity: "release"` was redirected to a release-group). `400` for malformed payload or an unresolvable release MBID; `401` when the bearer is missing or wrong; `503` when the env var isn't configured (Achordion's signal that submissions aren't accepted on this deploy).
- **TTL:** 90 days per MBID per entity. Re-submit periodically to keep the entry warm.
- **ISRC alias coverage (recording entity only):** when Achordion writes a recording's links to the cache, it ALSO writes the same blob under each of the recording's ISRCs (`track-links:isrc:<isrc>`). On a cache miss for a recording MBID the resolver falls back to ISRC aliases — so a Parachord submission against the single's MBID also serves the album-track MBID for the same audio (and vice versa). Submit + resolver both fetch ISRCs from MB lazily; Parachord doesn't need to send them.
- **Cache busting:** the submit endpoint calls `revalidatePath` for the entity's user-facing route (`/recording/<mbid>` + `/embed/track/<mbid>` for recordings, `/release-group/<mbid>` for release-groups) so the new links appear immediately without waiting out the page-level edge cache.

Submit only matches Parachord has actually played back successfully — that's the whole point of the source-priority. Drive-by URL matching belongs in Achordion's own Odesli/MB resolution path.

### Entity-link lookup (GET `/api/entity-link`)

Parachord can ask Achordion for the canonical Achordion URL for any artist / album / track MBID. Use this instead of hard-coding our URL convention — if Achordion ever moves a route (e.g. `/release-group/<mbid>` → somewhere else), the change ships through this endpoint without any client update.

- **Auth:** bearer token (gated on rollout). Achordion reads `ACHORDION_API_READ_TOKEN` from its env; Parachord configures the matching value and presents `Authorization: Bearer <token>` on every request. Gating is initially conservative — the data itself is non-sensitive (just URLs derivable from MBIDs), but unbounded read traffic could pile MB API calls onto the names-enrichment path. Plan to drop the gate once we understand caller volume.
- **Endpoint:** `GET https://achordion.xyz/api/entity-link?type=<type>&mbid=<mbid>[&include=names]`
- **Inputs:**
  - `type`: `artist` | `release-group` | `recording`. Aliases: `album` → release-group, `track` → recording.
  - `mbid`: 36-char UUID for the entity.
  - `include` (optional, comma-separated): pass `names` to enrich the response with track / artist / album names. One MB API call; skip when you only need the URL.
- **Response shape:**
  ```json
  {
    "type": "recording",
    "mbid": "de699185-9580-4308-a45b-f9ed98c7ce23",
    "url": "https://achordion.xyz/recording/de699185-...",
    "embed_url": "https://achordion.xyz/embed/track/de699185-...",
    "name": "Los Angeles",
    "artist_name": "Big Thief",
    "album_name": "Double Infinity"
  }
  ```
  `embed_url` is only present for `recording` (Achordion's iframe-friendly track widget). `name` / `artist_name` / `album_name` only present when `?include=names`. Status codes: `400` on malformed `type` / `mbid`, `401` on missing/wrong bearer, `503` when the env var isn't configured (this deploy doesn't accept lookups). Name-enrichment failures degrade silently rather than 502'ing — the URL is always derivable from MBID alone.
- **Cache:** `private, no-store`. Auth'd responses aren't safely edge-cacheable without `Vary: Authorization`, and at current volume the function-per-request cost is negligible. Revisit if usage grows.

Use case: every Parachord surface that wants a "View on Achordion" link (Now Playing card, library detail views, share sheet) can resolve through this endpoint without coordinating route shapes with Achordion.

### Embed-code lookup (GET `/api/embed-code`)

Companion to the entity-link endpoint: returns a ready-to-paste iframe snippet for Achordion's track / album embed widgets. Lets Parachord render a "Copy embed code" UI in its share sheet without hard-coding our embed URL conventions or recommended dimensions — both ship from this endpoint.

- **Auth:** bearer token. Same `ACHORDION_API_READ_TOKEN` as the entity-link endpoint.
- **Endpoint:** `GET https://achordion.xyz/api/embed-code?entity=<entity>&mbid=<mbid>[&width=<n>&height=<n>]`
- **Inputs:**
  - `entity`: `track` | `album`. Aliases: `recording` → track, `release-group` → album.
  - `mbid`: 36-char UUID.
  - `width` (optional): override the iframe `width` attribute. Default 600. Range 200–2000.
  - `height` (optional): override the iframe `height` attribute. Defaults match what `<EmbedShareButton>` ships in-app (180 for track, 260 for album). Range 200–2000.
- **Response shape:**
  ```json
  {
    "entity": "track",
    "mbid": "de699185-...",
    "embed_url": "https://achordion.xyz/embed/track/de699185-...",
    "page_url": "https://achordion.xyz/recording/de699185-...",
    "width": 600,
    "height": 180,
    "html": "<iframe src=\"https://achordion.xyz/embed/track/...\" width=\"600\" height=\"180\" loading=\"lazy\" style=\"border:0;border-radius:12px\" title=\"Achordion track\"></iframe>"
  }
  ```
  `400` on a malformed `entity` / `mbid` / out-of-range dimensions; `401` on missing/wrong bearer; `503` when the env var isn't configured.
- **Cache:** `private, no-store`. Pure string formatting; no external calls; per-request render is negligibly cheap.

Use case: Parachord's share sheet renders a "Copy embed code" pill alongside its existing "Copy link" pill, sourced from this endpoint so the recommended height stays in sync with the in-app `<EmbedShareButton>` defaults.

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
  - `track-links/` — recording MBID → external streaming-service URLs. Read-through cached in Upstash Redis (`track-links:<mbid>` blob, 90-day TTL). Cold cache resolves via Odesli + MB url-rels and writes back. The companion `track-links/submit` endpoint accepts authenticated POSTs from Parachord (bearer token via `PARACHORD_TRACK_LINKS_TOKEN`) so confirmed-on-playback matches override the lookup-derived ones — see Parachord interop contract section.
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
- `lib/clients/fanart.ts` — fanart.tv `artistthumb` fallback for artists without a usable Wikidata photo. Requires `FANART_API_KEY`; no key → returns null silently. ToS requires attribution: artist page surfaces a `Photo by fanart.tv` tooltip + link-back on the hero avatar AND adds a `fanart.tv` entry to the sidebar's Other Links whenever fanart supplied the image.
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

- `npm run dev` for local. **The dev server uses webpack, not Turbopack.** See the next subsection for the why.
- **Typecheck before committing:** `npx --no-install tsc --noEmit`. The project ships TS strict.
- **Lint:** `npx --no-install eslint <files>`.
- **Smoke tests:** `npm run e2e` runs the Playwright suite under `tests/e2e/` against a fresh `next build && next start` boot. The same suite runs against an arbitrary deployment via `E2E_BASE_URL=https://… npm run e2e` (skips the local web server). CI runs it on every PR + push to main via `.github/workflows/e2e.yml`. Coverage is intentionally a small surface area: static pages, charts, one canonical artist/release-group/recording, and the utility routes (robots, sitemap, OG image, auth providers). Add to it when you find a regression class the existing specs would have caught.
- Commits follow a focused-and-themed style — see `git log --oneline` for the cadence. Subject lines describe what the user-facing change does, not the implementation.
- Do not amend commits unless explicitly requested.
- Production deploy is Vercel from `main`; the WS-to-localhost approach works in production because Chrome / Edge / Firefox treat `ws://127.0.0.1` as a "potentially trustworthy origin" exception from mixed-content blocks.

### Why local dev runs webpack, not Turbopack

Turbopack + Tailwind v4 + Next 16 had a recurring dev-cache class drop: a fresh utility (`sm:inline-flex`, `z-30`, `max-w-[24ch]`, `lg:grid-cols-[minmax(0,1fr)_280px]`, etc.) would be missing from the served CSS even though the class string was right there in the TSX file. Symptom: ships fine in production (where `next build` does a clean full scan), broken on localhost. Fixing each occurrence cost a stop-server / `rm -rf .next` / restart cycle, and that *still* didn't always evict the bad scan state.

Two changes that, together, ended the dance:

1. **`npm run dev` uses `--webpack`.** Slower initial compile (~5–10s) but the bundler/Tailwind v4 interop is consistent, so a new class string in a TSX file is in the served CSS the moment the dev server has rebuilt. `npm run dev:turbo` is still wired up if you specifically want Turbopack's speed and accept the dance.
2. **`globals.css` pins `@source "../app"`, `@source "../components"`, `@source "../lib"`.** Default Tailwind v4 source detection is heuristic-based and would occasionally miss our edits; explicit paths force a deterministic scan tree.

If you ever do hit the symptom again on webpack:

1. Stop the dev server.
2. `rm -rf .next` (plus `.turbo` and `node_modules/.cache` if either exists).
3. Restart.
4. Hard-reload the browser.

Production `next build` has been unaffected throughout — that pipeline always did a clean full scan and produced correct CSS regardless.
