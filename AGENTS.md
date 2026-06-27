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
- **Inline links in dense text need touch-only padding + a font-size bump.** Anywhere multiple `<a>` elements sit on the same line separated by punctuation (the `Currently into: A, B & C` line on similar-users cards is the canonical case), give each link `inline-block pointer-coarse:px-1 pointer-coarse:py-1` so the tap zones stop butting against each other, and bump the line itself with `pointer-coarse:text-sm` (or a tier up) so individual letters aren't sub-thumb-tip. Desktop text-xs stays compact; coarse pointers get breathing room.
- **Cards can grow on coarse pointers.** Don't fight to keep a card the same height across pointer types — desktop benefits from density, touch benefits from generous tap targets, and the row layouts handle taller siblings fine. Adding `pointer-coarse:py-*` / bumping interior text size is preferable to cramming a 24px tap target onto a phone.
- **Reserve slots for streamed/conditional row content.** Anywhere a row has a Suspense'd or conditional element that may or may not appear (an `<OnAirIndicator>` only when the user is playing, a streamed favicon row that may resolve empty), wrap it in a fixed `min-h-[*] pointer-coarse:min-h-[*]` slot so the row's height doesn't reflow when the content arrives. Cards next to each other in a grid stay aligned; the user's eye doesn't jump as content streams in.

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

## Bot-protection exemptions (two layers)

Bot protection runs in **two independent layers**, and an exemption usually has to be made in **both** — fixing only one leaves the other still blocking:

1. **Vercel Attack Challenge Mode** (the "Vercel Security Checkpoint" JS challenge) — runs at the **edge, before `middleware.ts`**. Intermittent: Vercel turns it on under attack load. A non-browser client (a programmatic `fetch`, cURL, the Parachord apps' deep-link loaders) can **never** solve the JS challenge, so any challenge on a route they must reach is a hard failure. **This layer is dashboard-managed** — `vercel.json` WAF config supports only `challenge`/`deny`, not `bypass`, so the exemption can't live in the repo.
2. **`middleware.ts`** — the ASN block + known-bad-UA block + per-IP rate limit. Runs in the Edge runtime after the firewall. A `NextResponse.next()` here **cannot** undo an edge challenge from layer 1.

Two standing exemptions, each wired at **both** layers:

- **Link-preview crawlers** — `ALLOWLIST_UA` short-circuit in `middleware.ts` + a UA Bypass rule at the Firewall. Matches `facebookexternalhit` / `Slackbot` / `Discordbot` / `Applebot` / etc. so paste-unfurl cards work (see the table in the browser-extension section).
- **Public consume-side API routes** — `PUBLIC_CONSUME_API` short-circuit in `middleware.ts` (regex `^/api/(playlist/[0-9a-f-]{36}/(xspf|meta|preview)|announcements)$`) + a **path Bypass rule** at the Firewall. These are the read-only, public, CDN-cached endpoints the Parachord apps fetch programmatically: `/api/playlist/<mbid>/xspf` (playlist load via `parachord://play/playlist?url=…/xspf`), `/meta` + `/preview` (share cards), and `/api/announcements` (polled on launch). Chosen path-based over a shared-secret client header because every route serves only **public** data (private playlists 404 to tokenless callers) — the challenge protected nothing there, and a header token is spoofable once extracted from the client binary. If scraping abuse ever appears, tighten to a header match (`X-Parachord-Client`) at both layers and have the apps send it.

**The Firewall Bypass rule (layer 1) — must be set in the Vercel dashboard, it is not in this repo:**

- Vercel dashboard → the project → **Firewall** → **⋯ → Configure → Add New → Rule**.
- Condition: **Request Path** `matches` (regex) `^/api/(playlist/[0-9a-f-]{36}/(xspf|meta|preview)|announcements)$` — or describe it in the natural-language box: *"Bypass the firewall when the request path matches the regex …"*.
- Action: **Bypass**. Vercel's own docs point here: *"Automated tools and scripts cannot establish challenge sessions. For legitimate automation needs, use Bypass."* A custom-rule bypass skips custom + managed rules (incl. Attack Challenge Mode), though not system-level DDoS mitigation.
- **Order it ABOVE any Challenge/Deny rules** — first-match-wins, the same ordering lesson as the OG-image-fetcher Bypass rule (a bypass sitting below a deny/challenge never runs).

When adding a new programmatic endpoint a non-browser client must reach, extend `PUBLIC_CONSUME_API` **and** the Firewall Bypass rule's path regex together.

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

## Site-wide announcement banner

`lib/announcements.ts` + `components/layout/announcement-banner.tsx` drive a site-wide banner you can update *without* a redeploy. Storage is a single Upstash row at `announcements:json` holding a JSON array — same row that backs Parachord-desktop's in-app banner, so admin edits propagate to both surfaces from one place.

**Admin workflow** — Upstash CLI / console / REST. Schema:

```json
[
  {
    "id": "downtime-2026-05-12",
    "title": "Scheduled maintenance Tuesday 2am UTC",
    "severity": "warn",
    "body": "Listening data may be unavailable for ~10 minutes.",
    "icon": "🛠️",
    "cta": { "label": "Status", "url": "https://status.example.com/" },
    "surfaces": ["achordion"],
    "expiresAt": "2026-05-13T00:00:00Z"
  }
]
```

```redis
SET announcements:json '[…]'   # publish (replaces every banner — see "one slot" below)
DEL announcements:json         # clear every banner
```

**Fields:**

- `id` (req, stable) — dismissals key off this. To force users who already dismissed to see a re-published banner, bump the id (`downtime-…-v2`).
- `title` (req) — main line.
- `severity` — `info` | `success` | `warn` | `error`. Drives the tint. Defaults to `info`.
- `body` (opt) — second line, smaller. Plain text.
- `icon` (opt) — short glyph / emoji, ≤4 chars. Rendered in the leading slot.
- `iconUrl` (opt) — https-only image URL (≤20×20 visible) for when an emoji won't do. Honored only if `icon` is absent.
- `cta` (opt) — `{ label, url }`. Renders as an inline link at the right edge.
- `surfaces` (opt) — `("achordion" | "parachord")[]`. **Omit to show on every surface** (back-compat default for entries written before the field existed). Scope to `["achordion"]` for Achordion-only notices (typical for site downtime); scope to `["parachord"]` to avoid leaking desktop-app-specific banners into the web.
- `minVersion` / `maxVersion` (opt) — Parachord-desktop applies these; Achordion ignores them.
- `expiresAt` (opt, ISO-8601) — Achordion drops expired items server-side so they vanish automatically with no follow-up `DEL`.

**Resolution & caching:**

1. `lib/announcements.ts` loads the array (Upstash, falling back to `ANNOUNCEMENTS_JSON` env var for local dev).
2. `loadAllAnnouncements` is `unstable_cache`-wrapped (60s revalidate, tagged `announcements`) — server-component mounts in the `(content)` layout don't flip those static-rendered pages dynamic.
3. `getActiveAnnouncementsFor("achordion")` filters surface + drops expired.
4. `<AnnouncementBanner>` (server) hands the filtered list to `<AnnouncementBannerClient>` (client island), which picks the **first non-dismissed item** (one banner slot — admin controls priority by array order) and remembers dismissals in `localStorage` keyed by `id`.

**Where it's mounted:** above `<SiteHeader>` in both `app/(app)/layout.tsx` and `app/(content)/layout.tsx`, each Suspense-wrapped so a cold cache doesn't block first paint.

**`/api/announcements` route** is the public, unauthenticated feed Parachord-desktop polls — it hands back the full validated list (no surface or expiry filtering, since the desktop client does its own `minVersion`/`maxVersion`/expiry pass). Don't add Achordion-specific server-side filtering there; use the helpers in `lib/announcements.ts` for Achordion surfaces instead.

**When to use:** scheduled downtime (MB / LB / Parachord), partial outages, feature launches worth a one-line "hey, this is new" callout, urgent-but-not-disruptive notices. **When not to:** marketing copy ("check out X this week"), evergreen promos, anything that should live in a real surface (changelog / about / feed). Banners interrupt; treat the slot as expensive.

---

## Synthesised feed events (Achordion-side notifications)

LB's feed endpoint emits pins / loves / recommendations / follows from the viewer's network. Anything OUTSIDE that — bsky-friend linkages, @-mention pings, future Achordion-specific surfaces — gets merged into `/feed` as **synthetic FeedEvent objects** that share the LB FeedEvent shape so `<FeedEventList>` can branch on `event_type` and render them in one pass.

Five live today, all following the same pattern:

| Helper | Source | Event type | Flag |
|---|---|---|---|
| `getLovedRecordingEvents()` | fan-out over viewer's following → each user's recent feedback | `loved_recording` | _(unflagged)_ |
| `getBskyFriendLinkEvents()` | reverse `bsky-link-by-did` lookup against viewer's Bluesky follows | `bsky_friend_linked` | `bsky-link` |
| `getMentionEvents()` | Upstash mention-index (sorted set per mentioned user) | `mention` | `mentions` |
| `getListenAlongEvents()` | Upstash listen-along index (dual-keyed actor + target), beacon-driven from `<LiveOnAirIndicator>` only when `useParachordPresence()` confirms connected | `listen_along` | `listen-along-events` |
| `getPlaylistPublishedEvents()` | Upstash playlist-published index (sorted set per owner), recorded on the false→true `isPublic` edge inside `setPlaylistVisibilityAction` / `editPlaylistAction`. Reader re-checks visibility on render so a flipped-back playlist filters out | `playlist_published` | `playlist-published-events` |

**Where they get merged**:
- `app/(app)/feed/page.tsx` — fetches LB's `getUserFeed` + all five synthetics in parallel, merges, sorts by `created` desc, slices to 50, hands the array to `<FeedEventList>`. The `following` list is resolved once at the top and shared with the readers that need it (`loved_recording`, `listen_along`, `playlist_published`) so we don't fan out N parallel `getFollowing()` calls.
- `app/api/me/feed-unread/route.ts` — same synthetics counted alongside LB events for the badge + browser-notification trigger. All fail-soft (Promise.all with .catch fallbacks) so any single source going down doesn't suppress the others.

**Each renderer in `feed-event-list.tsx`** is a small function that takes the FeedEvent + reads its `metadata` payload as a typed shape; renderers branch via the central `switch (e.event_type)` block at the bottom of the file. Adding a fourth event type is the smallest possible PR: add a helper that returns `FeedEvent[]`, register a constant for the event-type string, write a renderer function, add a case to the switch.

**Passive backfill for mentions** lives at `lib/index-pin-mentions.ts` (called fire-and-forget from `getUserPins` / `getCurrentPin` call sites — `/user/<name>` and `/user/<name>/pins` pages). Parses `@username` tokens out of each pin's blurb and `ZADD mention:<lb-username>` for each mentioned recipient. Sorted-set trimmed to 200 entries per user, 90-day TTL.

**Mention rendering** at the visual layer:
- `lib/mentions.ts` — `parseMentions(text)` returns alternating `{ kind: "text" | "mention" }` segments; `extractMentions(text)` returns the unique lower-cased username set for indexing.
- `<MentionText text={...}>` in `components/achordion/mention-text.tsx` wraps mention segments in `<Link href="/user/<name>">@name</Link>` and leaves text segments as-is. No HTML strings, no `dangerouslySetInnerHTML` — every output is a typed React element.
- Used in both `<PinnedTrackCard>` (profile-page pins) and the `PinEvent` renderer (feed pins). Add it to any future free-text surface where `@mentions` should be clickable.

Behind the `mentions` flag in the admin registry — flip via `/admin/flags`.

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

## Reading the MB OAuth access token from a server route

Tag voting (and any future MB-write endpoint — collections, ratings) needs the user's MB OAuth access token, stored on Auth.js's session JWT as `mbAccessToken`. Two non-obvious things to know before adding more endpoints like this.

### 1. Don't use `getToken()` from `next-auth/jwt`

In our Auth.js v5 beta (`next-auth@^5.0.0-beta.31`), `getToken({ req, secret })` returns `null` for HTTPS requests even when the cookie is valid and `auth()` decodes it just fine. Its default cookie name + salt don't match what Auth.js v5's encoder writes. The result is a silent auth failure that looks identical to "user isn't signed in" or "scope is missing" from the client side.

**Use `decode()` directly instead**, with explicit cookie name and matching salt:

```ts
import { decode } from "next-auth/jwt";

async function readMbAccessToken(request: NextRequest): Promise<string | null> {
  const secureCookie =
    request.url.startsWith("https://") ||
    request.headers.get("x-forwarded-proto") === "https";
  const cookieName = secureCookie
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
  const cookie = request.cookies.get(cookieName)?.value;
  if (!cookie || !process.env.AUTH_SECRET) return null;
  try {
    const token = await decode({
      token: cookie,
      secret: process.env.AUTH_SECRET,
      salt: cookieName,
    });
    return typeof token?.mbAccessToken === "string" ? token.mbAccessToken : null;
  } catch {
    return null;
  }
}
```

Salt MUST equal the cookie name — that's what Auth.js v5 uses when encoding. The `try/catch` covers expired or rotated-secret tokens (rare, but a `null` return is friendlier than an unhandled throw).

Reference implementation: `app/api/musicbrainz/[entity]/[mbid]/tags/route.ts` (`readJwtMbAuth`). The `/api/auth/mb-debug` route keeps a side-by-side `getToken` vs `decode` comparison as a canary — if a future Auth.js upgrade fixes the `getToken` defaults, that endpoint will show `viaGetToken.hasMbAccessToken: true` and we can simplify the code.

### 2. MB OAuth: scope widening requires `approval_prompt=force`

MB's OAuth2 server is older Google-style, not OIDC. To force the consent screen for users whose original grant predates a scope we've since added (e.g. users who signed in before we asked for `tag`), the authorize URL needs `approval_prompt=force` — *not* the OIDC-spec `prompt=consent`, which MB silently ignores. Pass it via the `authorizationParams` (third) argument to `signIn()`:

```ts
await signOut({ redirect: false });
void signIn("musicbrainz", { callbackUrl }, { approval_prompt: "force" });
```

Without it, MB silently re-issues the cached `profile`-only grant on every re-auth attempt, causing a vote-401 → re-auth → vote-401 loop. `signOut + signIn` (rather than `signIn` alone) is also needed — Auth.js's same-provider sign-in shortcuts the OAuth handshake when an active session exists.

Reference: `triggerReAuth` in `components/achordion/tag-chips.tsx`. MB's full param list: https://musicbrainz.org/doc/Development/OAuth2

### 3. MB creates a new grant per scope set — old grants linger

When you widen a scope at MB, MB doesn't migrate the existing grant — it creates a parallel one. Users will see duplicate "Achordion" rows on https://musicbrainz.org/account/applications, one per scope set. The most recent token issued is the one in effect; the others are orphaned and can be revoked without signing the user out. Worth knowing if support questions surface — the duplication is MB's design, not a bug on our side.

---

## Auth-gated content on edge-cached routes (client-island pattern)

Public entity routes (`/release-group/:mbid`, `/artist/:mbid`, `/recording/:mbid`, `/charts/*`, `/about`, `/faq`, etc.) carry a shared `CDN-Cache-Control: public, s-maxage=21600, stale-while-revalidate=86400` header (see `PUBLIC_ENTITY_CACHE` in `next.config.ts`). The Vercel edge serves a single SSR'd response to every visitor for 6h, refreshing in the background — the entire reason these pages feel instant, and what keeps the rate-limited MB calls behind them rare. (Raised 1h → 6h since entity metadata changes on the order of days; per-user/fast-moving data lives in client islands, so the longer TTL doesn't stale it.)

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

### Mutating actions must `revalidatePath` API routes, not just `revalidateTag`

When an action mutates data that's surfaced by both a server-rendered page AND an API route (e.g. the playlist edit / delete / visibility actions touch `/user/<name>/playlists` and `/api/user/<name>/playlists`), `revalidateTag` is not enough on its own.

`revalidateTag` busts the in-process Next.js data-fetch cache that `lbFetch` / `mbFetch` populate inside the route handler. But the route's HTTP **response** can also live in two places `revalidateTag` doesn't reach:

1. **Vercel's edge CDN cache** — set by the response's `Cache-Control: public, s-maxage=N` header. A subsequent same-URL request can be served directly from the edge without re-running the function. Anonymous "Load more" type calls on a tagged-but-CDN-cached route can serve up to `s-maxage` seconds of stale data after a mutation.
2. **The RSC payload cache** on the client — set per route segment when Next ships a server-rendered page. Without a path-level revalidation, navigating back to the page after a mutation serves a stale render.

Call `revalidatePath(...)` on every affected path in addition to the tag bust. Reference implementation: `bustCache()` in `app/(app)/playlist/[mbid]/actions.ts` — busts `lb:playlist:<mbid>` and `lb:user:<viewer>:playlists` tags, and revalidates the four affected paths (`/user/<viewer>/playlists`, `/user/<viewer>`, `/api/user/<viewer>/playlists`, `/api/playlist/<mbid>/preview`).

Rule of thumb: every URL that surfaces the mutated data should be in the `revalidatePath` list. Skipping the API-route paths is the easy miss — they don't show up in `git grep` for the page route.

### Manual cache bust via the admin Cache tab

For stale slots that happen out of band — a tag vote performed before `revalidateTag` was wired in, an edit made directly on musicbrainz.org, a Parachord-side write whose submit auto-bust failed quietly — the `/admin/cache` page exposes a manual revalidate. Accepts entity = `recording` / `release-group` / `artist` / `release` (MB cache tags) or `playlist` (busts the `lb:playlist:<mbid>` tag + `/playlist/<mbid>` page path) + a UUID. Backed by the `revalidateMbEntity` / `revalidatePlaylist` server actions in `app/admin/actions.ts`. Admin-only; useful when you don't want to wait out the 24h MB-cache / 60-min playlist-page revalidate window.

Companion read-through: `GET /api/admin/playlist-links?mbid=<uuid>` returns the raw `PlaylistLinksEntry` from Upstash so you can confirm whether Parachord's submit landed before deciding the page render is the bug.

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

Favicon hosts are normalised through `faviconUrl(host)` / `faviconHost(host)` in `lib/favicon.ts` — currently rewrites `<artist>.bandcamp.com` to `bandcamp.com` so artist subdomains always show the canonical Bandcamp orange-dot favicon instead of whatever (or nothing) each artist has configured. Add new rewrite rules to `FAVICON_HOST_REWRITES` if other tenant-subdomain services join the row.

`<IconTooltip>` shows the friendly site name (X for twitter.com / x.com, MusicBrainz for musicbrainz.org, etc.).

---

## Render resilience: fetch timeouts, fail-open deps, first paint

Hard-won from a run of "page stuck on its skeleton" / intermittent-503 incidents. These recur — internalize them.

**1. Every outbound `fetch` MUST have a timeout — use `fetchWithTimeout` (`lib/fetch-timeout.ts`).** A bare `await fetch()` with no timeout can hang forever when the upstream is slow. In a server-component render path (directly or inside a Suspense boundary) that hang wedges the *whole* render — the page sits on its skeleton, and on CDN-cached routes the origin render never completes. **`try/catch` does NOT save you: a hang is never a rejection**, so `.catch(() => fallback)` only rescues real errors. This bit three times in one session — MusicBrainz, ListenBrainz, Odesli — each as a stuck skeleton / "Connection closed" until the client got a timeout. Every client routes through `fetchWithTimeout` (8s default) except `mbFetch` (8s inline) and Odesli (6s inline), which keep service-specific timeouts. New external client → `fetchWithTimeout`, never a raw `fetch`.

**2. Per-request external deps MUST fail open.** Middleware runs `checkRateLimit` (Upstash) on every non-prefetch page request. An unguarded Upstash call that throws crashes the middleware → Vercel 503 → mid-stream that surfaces to the client as "Connection closed" → stuck skeleton. `checkRateLimit` and the track-links cache reads now catch-and-allow on Upstash error. Any new per-request Upstash/Redis read: catch, return the permissive default. A limiter or cache going down must never take the app down with it.

**3. MB/LB throttle is 1 req/sec PER INSTANCE — no cross-instance coordination.** N warm Vercel instances can collectively blow past the upstream limit → 429. `mbFetch` honors `Retry-After` and retries once before surfacing the rate-limit page. Practical consequence: entity pages that fan out many MB calls serialize through this queue, so **sequential awaits before first paint are expensive** (≈≥1s each). Hence #4.

**4. Don't block first paint on slow/serialized data — split Suspense, stream the rest.** Reference: `app/(app)/release-group/[mbid]/page.tsx`. `AlbumBody` awaits ONLY `getReleaseGroup`, renders the header, and hands `getRelease` + the artist-recordings fetch to Suspense'd children as **unawaited promises** (so they run concurrently and stream in). Cover art renders even in the skeleton — `caaReleaseGroupUrl(mbid)` is derived from the mbid (no fetch). Viewer-agnostic slow/hang-prone data (listener stats, reviews) lives in **lazy client islands** backed by **CDN-cacheable** API routes (`/api/<entity>/[mbid]/listeners`, `.../reviews`; generalized island `components/achordion/entity-listener-stats.tsx`), keeping the rate-limited LB/MB calls off the cached render path entirely. This is also the auth-gated-content pattern (see "Auth-gated content on edge-cached routes").

**5. `prefetch={false}` on dense entity-link grids.** Next prefetches every visible `<Link>` on viewport entry. A dense page (explore/charts: nav + footer + sidebar + 12 cards + per-row entity links) fired ~150 RSC requests in one wave, tripping Vercel request-shedding (503s) — and a shed 503 on the link you clicked makes the soft navigation silently no-op (looks like "clicking does nothing"). All dense grids (`fresh-releases-grid`, `explore-track-list`, `recommended-artists-list`, `charts-list`, `lb-charts-list`, `college-charts-list`, `top-tracks/artists/listeners-list`, `discography`, `critical-darling-card`, `top-albums-grid`, `user-card`) set `prefetch={false}` on their `<Link>`s. Never prefetch high-cardinality grid links. Play controls (`PlayOnHoverFab`, `PlayOverNumberCell`) are `<a>`/buttons and never take `prefetch`.

**6. `<CoverArt>` rides out transient Cover Art Archive failures.** CAA 302-redirects to individually-flaky archive.org storage nodes; `<CoverArt>` retries once (cache-busted, re-resolving the redirect to a fresh node) before the Disc3 placeholder. Don't simplify that away.

**7. Playlist cards show the CREATED date, not `last_modified_at`.** A client sync that edits playlists in place bumps `last_modified_at`; showing that on the card made a library-wide sync look like every playlist's creation date reset. `playlist-card.tsx` prefers `p.date` (created, stable), matching the detail page.

---

## Track-links cache (Redis) + resolver

Persistent MBID → external-streaming-URL store backed by Upstash Redis. Lives in **`lib/track-links-store.ts`** (raw cache CRUD) + **`lib/track-links-resolver.ts`** (the read-through pipeline). Read by every favicon row on the site and populated by Parachord submissions, Achordion's own Odesli / MB lookups, and the source URLs Parachord scrobbles passively report (`origin_url`). Disclosed publicly in the About page section "The recording-to-streaming-link gap (and why we're filling it)" — the long-term goal is an open, community-curated mapping fed by Parachord playback, not a private cache.

### Resolver pipeline

`resolveTrackLinks({ mbid, entity, seedUrl?, prefetched? })` runs steps in order, returning the first non-empty result:

1. **Direct cache hit** — `getCachedTrackLinks(mbid, entity)`. Recording uses key `track-links:<mbid>`; release-group uses `track-links:release-group:<mbid>`. On a hit, if a `seedUrl` (a scrobble's `origin_url`) names a streaming host the cached set doesn't have yet, that one link is merged in fire-and-forget (fill-only `parachord-scrobble`) so a track accumulates services as it gets played from new sources — otherwise the hit is a pure read.
2. **MB fetch** — for cache miss, fetches the recording / release-group from MB to extract url-rels + ISRCs (recording only). Skipped when caller passes `prefetched` (entity pages already have the recording loaded).
3. **ISRC alias fallback** (recording only) — `getCachedTrackLinksByIsrcs(isrcs)`. Same audio is often modeled as two distinct recording MBIDs (single + album-track variants); ISRC is the canonical "same audio" identifier MB exposes. On hit, back-fills the per-MBID cache.
4. **Name alias fallback** (recording only) — `getCachedTrackLinksByName(artist, title)`. Last-resort bridge for the "same song, two MBIDs, no shared ISRC" case. Keyed on exact normalized `(artist, title)`: includes the artist (covers by other artists never match) and the exact title (MB's parenthetical ETI keeps live / demo / remix variants on separate keys). On hit, back-fills the per-MBID cache.
5. **Odesli + MB merge** — calls `getOdesliLinks(seedUrl ?? mbStreamingUrls[0])` and merges with any MB url-rels. Skipped when seed is unavailable.
6. **Played-source capture** — if a `seedUrl` was passed (a scrobble's `origin_url`) and its host wasn't already covered by Odesli/MB, the played URL is kept as a fill-only `parachord-scrobble` link, so a track that was actually played retains at least its played-from link even when Odesli can't expand it.
7. **Write-through** — writes the resolved set under MBID + each ISRC alias key + the `(artist, title)` name-alias key (90-day TTL), tagging each link by source. Always pass through `setCachedTrackLinks` even on partial resolves so the next ISRC- or name-equivalent lookup hits.

Output is sorted by `sortByPlatformPriority` against the same `STREAMING_HOST_PRIORITY` table the renderer uses.

### Source priority

Each cached link is tagged with its origin: `parachord` > `odesli` > `mb` > `parachord-scrobble`. `mergeLinks` in the store resolves host conflicts by priority, ties going to the incoming link — a Parachord-confirmed Spotify URL overrides an Odesli-resolved one, which overrides an MB url-rel.

**`parachord` vs `parachord-scrobble`** (both come from Parachord, very different trust):

- **`parachord`** (highest) — an explicit, above-confidence-threshold submission to `/api/track-links/submit`. Parachord played the track, confirmed the match, and *pushed* the links. Most authoritative; can override Odesli/MB.
- **`parachord-scrobble`** (lowest) — the `origin_url` a scrobble passively reported it streamed from, captured by the resolver on the read side. The URL is real, but its recording MBID came from ListenBrainz's mapper (which can pick the wrong sibling recording), so it ranks lowest and is **fill-only**: it only ever populates a host no better source covered, and never overrides a resolved or confirmed link. It exists to catch plays *below* Parachord's submit threshold, which still scrobble their source.

**Parachord's top tier exists because those URLs are implicit-human-curated** (a real listener picked the MBID, picked a service, pressed play, and audio came out — see About page framing).

### Where the cache is read

| Surface | Pattern |
|---|---|
| Recording page favicon row | `<StreamingLinksRow entity="recording">` (client island) |
| Album page favicon row | `<StreamingLinksRow entity="release-group">` (client island) |
| Embed track widget | server-await `resolveTrackLinks` (iframe context, no client JS bloat) |
| Embed album widget | server-await `resolveTrackLinks` |
| Pin cards | server-await `resolveTrackLinks` (1-5 cards per page; cheap; eliminates client variability) |
| Per-track click-to-expand pills | `<InlineTrackLinks>` → `/api/track-links` GET (lazy on click) |

**When to pick which:** server-side resolution is the default. Use the `<StreamingLinksRow>` client island only when SSR-blocking is a concern (entity hero rows where a cold Odesli call would block the page paint). The client island server-renders the MB url-rels as initial paint then upgrades on mount via `/api/track-links`.

**Don't reach for `<OdesliLinks>` for new code** — it's the legacy SSR-only path that bypasses the cache. New favicon rows should go through `<StreamingLinksRow>` or `resolveTrackLinks` directly.

### Local dev caveat

Without `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_URL` / `KV_REST_API_TOKEN`) in `.env.local`, the Redis client doesn't get instantiated and every cache call no-ops. Resolver still works but loses the cache layer — you'll only see MB url-rels + Odesli-resolved entries, never Parachord-submitted ones. Pull the same creds prod uses to match production behavior locally.

---

## Hydration-stable timestamp rendering

Anything that displays "X ago" / "in Xm" implicitly reads `Date.now()` during render. Server-side and client-side renders that straddle a minute / hour boundary produce different strings, which React 19 / Next 16 surface as a recoverable error.

Use **`<RelativeTime value={unixSeconds} />`** (or `<RelativeTime asTime />` for a `<time dateTime=...>` wrapper) from `components/achordion/relative-time.tsx`. The component sets `suppressHydrationWarning` on the rendered element. The absolute `dateTime` / `value` is the source of truth; the visible client-rendered string is the more accurate one anyway.

For mixed text where the relative time is one of several children of a single parent ("· pinned 2h ago · expires in 4d"), put `suppressHydrationWarning` on the parent span instead of wrapping each call individually.

The pure helpers `relativeTime(unixSeconds)` and `relativeFromNow(unixSeconds)` (the past + future variant) are exported from the same module if you need the string for an `aria-label` / tooltip.

---

## Page loading skeletons (`loading.tsx`)

Two layers of loading state, distinct purposes:

1. **Route-level `loading.tsx`** — fires during cross-page soft navigation while the destination's RSC is resolving. Without it, the previous page's content stays mounted until the new RSC is fully ready. Living examples: `app/(app)/loading.tsx` (generic catch-all), plus per-route overrides for entity pages (artist / release-group / recording / playlist) and the user profile (`/user/[name]/loading.tsx`, which inherits to all sub-routes by default).
2. **In-page `<Suspense fallback={...}>`** — fires during the streaming render of a single page (initial direct-arrival load). Lets the page shell paint while async server components inside resolve.

When adding a new route, decide:
- If the route's body is mostly one async block, the in-page `<Suspense>` may not be necessary — `loading.tsx` covers it.
- If the page header can paint instantly while different sections stream in independently (artist hero + Suspense'd discography + Suspense'd similar artists), keep the in-page Suspense. `loading.tsx` covers the cross-page navigation gap; Suspense covers the streaming inside the page.

The generic `(app)/loading.tsx` catches every (app) route that doesn't ship its own — start there. Add a per-route override only when the generic shape (eyebrow + title + 8-row list) feels jarring against the real layout.

---

## Entity-page header convention

Artist / album / track pages share one component tree:

- **`<PageHeader>`** for the structural shell — `breadcrumbs`, `eyebrow`, `title`, `description`, `leading` (cover or avatar), `afterTitle` (action row), `actions` (right-justified slot).
- **`<EntityHeaderStats>`** in the `actions` slot for the listens / listeners "big numbers stacked over uppercase eyebrow labels" treatment. Single source of truth for that block — three pages used to define it inline as duplicate JSX.
- **Cover / avatar** wrapped in a `group relative aspect-square overflow-hidden rounded-md` container with `<PlayOnHoverFab>` overlay (or no overlay for non-playable entities). Replaces the old "Play in Parachord" pill that used to sit under the byline.
- **Action row in `afterTitle`** carries `<TrackActionsMenuSlot>` / `<TrackListActionsMenu>` (overflow ⋮), `<StreamingLinksRow>` (favicons), and `<EmbedShareButton>` (track / album only). All three share one row directly under the byline.
- **Tags + page-level actions** render BELOW `<PageHeader>` in a sibling row — `<TagChips>` left, no longer flush with the embed button (the embed button moved into the favicons row).

When adding a new entity page, copy the pattern from `app/(app)/recording/[mbid]/page.tsx` — it's the most current reference.

---

## Parachord interop contract

This section is for **Parachord agents** modifying the `parachord-desktop` / `parachord-mobile` / `parachord-website` / `parachord-browser-extension` codebases who need to keep Achordion in sync.

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

As of 2026-05-21 (issue #63), every Parachord URL Achordion emits is the HTTPS Universal Link / App Link form (`https://parachord.com/<verb>`) — not the legacy `parachord://` custom scheme. The constant lives at `lib/parachord.ts` (`PROTOCOL`); the rest of the builder is verb-agnostic so the change cascaded automatically across every play surface.

The desktop WS-presence story doesn't translate to phones: Parachord-mobile is a sandboxed app, not a process running a localhost listener, and iOS/Safari blocks `ws://127.0.0.1` from web pages anyway. So `useParachordPresence` short-circuits to `true` on `(pointer: coarse)` clients and trusts the OS to dispatch the deep-link.

For that trust to be earned, **Parachord-mobile registers Universal Links (iOS) and App Links (Android)** for every Parachord URL shape Achordion produces:

- **iOS — Universal Links**
  - Pick a host you control for the universal version of the protocol — typically `https://parachord.com/play`, `https://parachord.com/play/album`, `https://parachord.com/listen-along`, etc., one path per protocol verb. Mirror the existing `parachord://` query-string shape verbatim so the same URL works in both forms.
  - Host an `apple-app-site-association` (AASA) JSON at `https://parachord.com/.well-known/apple-app-site-association` with the app's team-id-prefixed bundle ID and the path patterns above. No file extension; served as `application/json`; no redirect.
  - In the iOS app's entitlements, add `com.apple.developer.associated-domains = applinks:parachord.com`.
  - Implement `application(_:continue:restorationHandler:)` (UIKit) or the SwiftUI `onOpenURL` / `onContinueUserActivity(type: NSUserActivityTypeBrowsingWeb, ...)` handler to receive the inbound URL and route it the same way the `parachord://` scheme handler does.
  - **Fallback for users without the app installed:** the Universal-Link host page (`https://parachord.com/play?…`) should server-render a "Get Parachord" pitch with the destination context (track name, etc.) preserved. iOS only opens the app when the AASA permits the path *and* the app is installed; otherwise Safari renders the URL — meaning a not-installed user lands on a useful page instead of an OS error.

- **Android — App Links**
  - Same idea, different ceremony. Add `<intent-filter android:autoVerify="true">` for each Universal-Link path host on the activity that handles the deep link. Host the matching `assetlinks.json` at `https://parachord.com/.well-known/assetlinks.json` with the app's package name + signing-cert SHA-256 fingerprint.
  - Verified App Links open the app directly without the OS chooser; an unverified or unmatched path opens the URL in the user's default browser, again landing on the install pitch.

- **Android — `parachord://listen-along` doesn't launch the app (likely host-scoped intent filter)**
  - Symptom: `parachord://play/album|playlist|radio|...` URLs from Achordion's hover-Play FABs and "Play in Parachord" buttons launch the Android app correctly. `parachord://listen-along?service=...&user=...` from the user-card listen-along buttons does **not** — Chrome falls through (or our `intent://` form lands on the `S.browser_fallback_url`).
  - Cause is almost certainly that Parachord-Android's `<intent-filter>` declares `<data android:scheme="parachord" android:host="play" />` (and probably `host="import"`, `host="queue"`) but no host entry for `listen-along`. Filters with a `host=` attribute only match URLs whose host segment equals that value, so `parachord://listen-along?...` finds no claimant and the OS treats it as un-handleable.
  - Quick diagnostic — this should error with "Activity not started, unable to resolve Intent" if the host scoping is the cause:
    ```
    adb shell am start -W -a android.intent.action.VIEW \
      -d "parachord://listen-along?service=listenbrainz&user=kutx"
    ```
  - **Fix on the Android side**: either add a sibling `<data android:host="listen-along" />` entry to the existing filter, drop the `host=` attribute entirely so every `parachord://*` URL matches (simplest), or split into one `<intent-filter>` per protocol verb. The complete protocol surface Achordion ships today is `play/album`, `play/playlist`, `play/radio`, `import`, `queue/add`, and **`listen-along`** — make sure every host shown in [`lib/parachord.ts`](./lib/parachord.ts) is reachable.
  - After the Android fix lands, raw `parachord://listen-along?...` from a regular anchor click will launch the app the same way Play does today. No Achordion-side change needed.

- **Custom-scheme fallback** (`parachord://...`) should keep working as today — it's still useful from contexts that don't go through a browser (in-app webviews, share sheets). On iOS in particular, `parachord://` URLs invoked from within Safari are subject to the same OS dialog ("Cannot Open Page") when the app isn't installed; that's why the Universal-Link form is preferred from web pages and we keep `parachord://` for app-to-app deep linking.

If those pieces are in place, Achordion's mobile UX needs **no further changes** — every play surface taps a `parachord://` URL, the OS routes it to the app or the web fallback, and the user either plays the track or gets pitched on installing.

If they aren't yet:
- Tapping a play affordance on mobile from a non-installed user opens the OS's "Cannot Open Page" alert (iOS) or does nothing visible (Android).
- The `parachord://` URL is still valid for installed users — they get correct behaviour.
- We accept that as a bridging trade-off; the install pitch lives at the homepage / `/apps` Marketplace until the Universal-Link path is live.

### Playlist sync — reconcile against existing LB playlists, never re-create

This is the contract for **any** Parachord client (notably **parachord-mobile / Android**) that syncs the user's local playlists up to ListenBrainz. Achordion is a read-mirror of the user's LB playlists; a sync that gets this wrong corrupts the library Achordion displays.

**Context — the 2026-05 incident.** Parachord-Android's sync duplicated the user's entire LB playlist library: every playlist reappeared as a brand-new record with a new MBID, `dateCreated` reset to the sync day, and **all public**. Achordion was confirmed *not* the cause (its only create path is the user-initiated single-track "new playlist" button; it has no bulk-create or sync). The duplication + date reset is the unmistakable signature of a sync that **re-creates** playlists instead of updating the existing ones, with visibility left unset.

**Golden rule: a playlist that already exists on LB must be UPDATED in place, never re-created.** LB playlists are keyed by MBID. Sync must persist a local→LB MBID mapping and drive everything off it.

1. **First upload** of a local playlist: `POST /1/playlist/create`, then **store the returned `playlist_mbid`** against that local playlist's stable id. This mapping is the source of truth for every later sync.
2. **Subsequent syncs**: look up the stored MBID and update in place. LB exposes three distinct edit endpoints, all keyed by MBID — pick the right one for the operation:
   - metadata (title / description / visibility): `POST /1/playlist/edit/{mbid}`
   - **add** tracks: `POST /1/playlist/{mbid}/item/add`
   - **remove** tracks: `POST /1/playlist/{mbid}/item/delete`

   Don't conflate these — `/edit/{mbid}` does NOT accept a track list and a track-mutation call to `/edit/{mbid}` 400s. And **never** call `/playlist/create` for a playlist that already has a mapping.
3. **Mapping persistence must survive any save bug.** Don't store the local→MBID mapping as a single field on the playlist data shape — that field gets stripped by save paths that forget to forward it, and stranding the mapping triggers re-creation on the next sync. Parachord-desktop learned this the hard way and now keeps the mapping in a separate, main-process-owned key (`sync_playlist_links`) that's written independently of the playlist object. Any client doing LB sync needs an equivalent: a storage layer where dropping the mapping requires *two* simultaneous bugs, not one.
4. **A failed fetch is not a confirmed-empty result.** Before deciding "the stored MBID is gone, recreate it" the sync must have a *successful* response from LB confirming the playlist is missing. Distinguish three states:
   - HTTP success, MBID present in response → reuse mapping ✓
   - HTTP success, MBID definitively absent (404 on direct lookup, or a complete paginated `/1/user/{user}/playlists` walk with no match) → handle per rule 5
   - HTTP error / timeout / 5xx / 429 / malformed body / partial pagination → **abort the sync cycle for this playlist; preserve the mapping**; retry next cycle.

   Treating transient unreachability as confirmed-empty is exactly how the 2026-05 incident compounded to 6,397 duplicates — the dedup repeatedly "discovered" the remote was gone every time LB had a hiccup.
5. **Missing on LB** (a *successful* lookup confirmed the stored MBID 404s, because the user deleted it server-side): treat as gone — create once and re-map. Don't keep recreating on every sync.
6. **Idempotency is a hard requirement, and it's stronger than "count unchanged."** Running sync twice with no local changes must produce **identical remote state** — same MBIDs, same `dateCreated`, same titles, same track lists. Counting playlists alone misses the failure mode where a buggy sync deletes-then-recreates with the same count (net zero in cardinality, but every MBID is fresh and every `dateCreated` is reset). The test: diff `GET /1/user/{user}/playlists` before/after a no-op sync and assert the diff is empty.
7. **Never touch `dateCreated`** — it's immutable on LB and only *stays* correct if you never re-create. A reset creation date is the canary that something is recreating; bake it into the idempotency test above.

**Visibility — always send an explicit `public` flag derived from the local playlist; default private; never use `true` as a sync-side default.**

There are two related ways a sync can publish playlists the user didn't ask to publish:

- **Omitting the flag.** ListenBrainz defaults a playlist whose JSPF extension has no `public` field to public. (Achordion's own reader mirrors this: `isPublic: ext?.public ?? true` in `lib/clients/listenbrainz.ts`.) So a create payload that doesn't set `extension["https://musicbrainz.org/doc/jspf#playlist"].public` at all is silently publishing everything.
- **Explicitly defaulting to `true`.** The Parachord-Android sync that caused the 2026-05 incident wasn't omitting the field — its `ListenBrainzSyncProvider.createPlaylist` literally passed `isPublic = true` as a hard-coded constant to the LB client, ignoring the local playlist's real visibility. An "always send explicit" rule alone would not have caught that; the implementer wrote `true` deliberately. Both failure modes need closing.

Rules:

1. Every create/edit payload must set `extension["https://musicbrainz.org/doc/jspf#playlist"].public` **explicitly**, derived from the local playlist's real visibility state.
2. When the local visibility is unknown or unset, default to **private** (`public: false`). Publishing is a deliberate user action, never a sync side-effect.
3. Never pass `public: true` (or `isPublic = true`, `visibility: "public"`, etc.) as a default in any sync-provider call. The only place `public: true` may appear in sync code is reading a *user-set* explicit-public flag off the local playlist and forwarding it unchanged. Grep for `true` literals in any LB create/edit construction during review — that's the smell.

Reference payload shapes: `createPlaylistOnLb` and `editPlaylist` in [`lib/clients/listenbrainz.ts`](./lib/clients/listenbrainz.ts) — Achordion always passes an explicit `public` value derived from the user action that opened the create surface (single-track favicon click), which is why its create path never had this bug.

### What Parachord expects from Achordion

- Achordion never auto-fires a `parachord://` URL. Every link is user-initiated.
- The smart-link pages at `go.parachord.com/<id>` use the same WS contract — Achordion's UX treats Parachord identically.
- The "Get Parachord" disabled-state link points at `https://parachord.com` (constant `PARACHORD_HOMEPAGE` in `parachord-button.tsx` and `play-on-hover-fab.tsx`). If the canonical install URL changes, search both files.
- On `(pointer: coarse)` clients we render every play surface as Parachord-present-by-default — assume installed, deep-link through the OS. Don't add a separate "is mobile?" check inside individual components; piggyback on `useParachordPresence` which handles the gate centrally.

### Track-links submission (POST `/api/track-links/submit`)

Parachord can push confirmed-on-playback MBID → external-streaming-URL matches into Achordion's persistent links cache. Each submitted link is stored with `source: "parachord"`, which outranks the Odesli + MB lookups Achordion does itself — so the next user who clicks the favicon row sees the playback-verified URL, not Odesli's best-effort match. Works for both **recordings** (per-track URLs) and **release-groups** (per-album URLs).

- **Auth:** bearer token. Achordion reads `PARACHORD_TRACK_LINKS_TOKEN` from its env; Parachord side configures the matching value and presents `Authorization: Bearer <token>` on every request.
- **Client attribution (telemetry):** send `X-Parachord-Client: desktop | android | ios` to attribute the contribution by platform. The server normalizes it against that allowlist (`lib/parachord-client.ts`) — anything else (or absent) is recorded as `unknown` — logs it (`[track-links-submit] client=…`), and echoes it back as `client` in the response. It's **telemetry only** (client-controlled → never used for authz); omitting it is fine and changes nothing.
- **Endpoint:** `POST https://achordion.xyz/api/track-links/submit` (or `localhost:3000/api/track-links/submit` for dev).
- **Body:**
  ```json
  {
    "mbid": "<entity-mbid>",
    "isrc": "GBAYE0601498",
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
  - **One of `mbid` or `isrc` is required.** Supply `mbid` directly when you have it; supply `isrc` (12-char, `^[A-Z]{2}[A-Z0-9]{3}\d{7}$`, case-insensitive) when you don't. When `mbid` is absent, Achordion resolves the ISRC to a recording MBID server-side via MusicBrainz's exact `/ws/2/isrc/{isrc}` lookup (first result — ISRC is an exact recording identifier, so no fuzzy-search risk), then runs the normal recording-keyed flow. This lets ISRC-only clients contribute during LB MBID-mapper outages and for streaming-resolved tracks (Spotify `externalIds.isrc` / Apple Music `attributes.isrc` come for free, often before any MBID is known). An unresolvable ISRC (not in MB, or MB unreachable) returns **400** — Achordion never writes a placeholder, so the client should retry later. The resolved MBID comes back in `stored_as.mbid`. The submitted ISRC is always aliased onto the cache entry (`track-links:isrc:<isrc>`) even if MB's `recording.isrcs` hasn't caught up. `isrc` only makes sense with `entity: "recording"` (the default).
  - `entity` (optional, default `recording`):
    - `recording` (alias `track`) — per-track URLs (Spotify track links etc.). Cached under recording.
    - `release-group` (alias `album`) — per-album URLs. Cached under release-group.
    - `release` — per-album URLs against a *specific edition* MBID. Achordion looks up the release in MB and redirects the cache write to its parent release-group; the response's `stored_as` field surfaces the resolved release-group MBID so Parachord can update its own mapping if useful.

    The two storage entity types (`recording` and `release-group`) use separate cache namespaces so MBIDs can't collide.
  - `label` and `host` are optional — Achordion derives `host` from the URL and capitalises the second-level domain when missing. `trackName` / `artistName` / `albumName` are also optional but encouraged: they make the stored cache entry self-describing (so admins can scan keys without an MB roundtrip to identify what each entry is) and unlock future search-by-name features over the cache.
- **Response:** `200 { ok: true, accepted: <n>, stored_as: { entity, mbid } }` on success — `stored_as` echoes the storage key Achordion actually used (matters when `entity: "release"` was redirected to a release-group, or when an `isrc` was resolved to a recording MBID). `400` for malformed payload, neither `mbid` nor `isrc` supplied, a malformed ISRC, an unresolvable ISRC, or an unresolvable release MBID; `401` when the bearer is missing or wrong; `503` when the env var isn't configured (Achordion's signal that submissions aren't accepted on this deploy).
- **TTL:** 90 days per MBID per entity. Re-submit periodically to keep the entry warm.
- **ISRC alias coverage (recording entity only):** when Achordion writes a recording's links to the cache, it ALSO writes the same blob under each of the recording's ISRCs (`track-links:isrc:<isrc>`). On a cache miss for a recording MBID the resolver falls back to ISRC aliases — so a Parachord submission against the single's MBID also serves the album-track MBID for the same audio (and vice versa). Submit + resolver both fetch ISRCs from MB lazily; Parachord doesn't need to send them.
- **Cache busting:** the submit endpoint calls `revalidatePath` for the entity's user-facing route (`/recording/<mbid>` + `/embed/track/<mbid>` for recordings, `/release-group/<mbid>` for release-groups) so the new links appear immediately without waiting out the page-level edge cache.

Submit only matches Parachord has actually played back successfully — that's the whole point of the source-priority. Drive-by URL matching belongs in Achordion's own Odesli/MB resolution path.

### `POST /api/playlist-links/submit`

Parachord push endpoint for playlist mirror-link mappings. Accepts:

  {
    "mbid":         "<listenbrainz-playlist-mbid (UUID)>",
    "name":         "<playlist title>",                       // optional
    "creatorName":  "<playlist creator>",                     // optional
    "trackCount":   <int>,                                    // optional
    "links":        [
      { "host": "open.spotify.com",  "url": "https://...",  "label": "Spotify" },
      { "host": "music.apple.com",   "url": "https://...",  "label": "Apple Music" },
      { "host": "listenbrainz.org",  "url": "https://...",  "label": "ListenBrainz" }
    ]
  }

Storage: per-MBID Redis key with 90-day TTL via `lib/playlist-links-store.ts`. Source is always `"parachord"`. Same bearer (`PARACHORD_TRACK_LINKS_TOKEN`) and same rate-limit class as track-links/submit.

Cache busting: on successful write, the submit route calls `revalidateTag('lb:playlist:<mbid>')` + `revalidatePath('/playlist/<mbid>')` so the new "Listen on" favicon row appears on the next visit instead of waiting out the page's `s-maxage=3600, stale-while-revalidate=86400` edge cache. Without this, even a known-good submit can sit invisible on the page for up to 25 hours.

Diagnostics: every attempt logs a `[pl-links] submit: …` line with the failure mode (`endpoint not configured` / `no bearer token` / `bearer mismatch` / `rate-limited` / `invalid JSON` / `invalid body` / `mbid=… recorded=…`). For one-off cache busting, `/admin/cache` accepts `entity=playlist` + a UUID and runs the same `revalidateTag` + `revalidatePath` pair. To peek at the stored entry, `GET /api/admin/playlist-links?mbid=<uuid>` returns the raw `PlaylistLinksEntry` (admin-only).

Used by `/playlist/<mbid>` page to render "Listen on Spotify / Apple Music / ListenBrainz" links. Also surfaced via `/api/entity-link?type=playlist` as the canonical URL for sharing.

### `POST /api/listen-along/event`

Records one listen-along event in the Upstash `listen-along:from:<actor>` + `listen-along:to:<target>` sorted-set pair, which the `getListenAlongEvents()` reader fans out into `/feed` as a synthetic `listen_along` event (see "Synthesised feed events"). Same flag gate (`listen-along-events`), same dedupe (60s per actor → target pair), same indexer regardless of who's calling.

Two auth surfaces share the same body+gate+indexer:

**Surface A — browser beacon (session-cookie auth).** Used by `<ListenAlongLink>` when a signed-in viewer clicks the Listen along pill anywhere on Achordion AND `useParachordPresence()` confirms Parachord is connected. Fire-and-forget via `navigator.sendBeacon` so the `parachord://` navigation never blocks.

  Body: `{ "target": "<lb-username>" }`
  Auth: Auth.js session cookie — viewer = `session.user.mbUsername`.

**Surface B — Parachord apps (bearer-token auth).** Use when the user starts a listen-along session inside Parachord desktop / mobile directly (not via the Achordion pill) so the event still lands in Achordion feeds — the target sees "X tuned into your stream in Parachord," the actor's followers see "X listened along with Y in Parachord," and X themselves sees "You listened along with Y in Parachord" in their own feed.

  Body: `{ "viewer": "<lb-username>", "target": "<lb-username>" }`
  Auth: `Authorization: Bearer <PARACHORD_TRACK_LINKS_TOKEN>` — the same env var used by `/api/track-links/submit` and `/api/playlist-links/submit`, since this is one logical writer (Parachord) writing through one bearer.

Both surfaces respond with `{ "ok": true, "recorded": <bool> }`. `recorded=false` means the request was accepted but dropped (flag off, self-target, dedupe window, or storage outage). Fire-and-forget callers can ignore the field; richer clients can use it to surface "tuned in" UI.

When to call from the apps: at the moment a user actually starts a listen-along session in Parachord (i.e. the point at which audio begins playing along to the target's stream). Don't call on UI-open / hover / preview — the event represents a real "I'm listening with you right now" intent, the same threshold the Achordion-side pill represents.

Diagnostics:

- Every attempt logs a `[listen-along] <source>: …` line where `<source>` is `beacon` (session-cookie path) or `submit` (bearer path). Failure modes are tagged: `no session, no bearer` / `bearer mismatch` / `invalid payload` / `dropped (flag off …)` / `self-target dropped` / success-with-recorded.
- `GET /api/admin/listen-along?user=<lb-username>` returns the raw `from` + `to` Upstash entries for that user (admin-only) so you can confirm a submit landed without grepping logs.

Used by the `/feed` page and the `/api/me/feed-unread` count (alongside the other synthetic events) — no other downstream surface today.

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
  - `entityName` (optional): track or album title. Joined with `artistName` to form the iframe `title=` attribute as `"Track — Artist"`. Falls back to a generic `"Achordion track"` / `"Achordion album"` when not supplied. Encouraged: screen readers + host-page hover-text describe the embed by what it actually plays. Up to 500 chars.
  - `artistName` (optional): primary credited artist. Same purpose as `entityName`. Up to 500 chars.
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
- `lib/track-links-store.ts` — Upstash Redis CRUD for the MBID → external-link cache (`server-only`)
- `lib/track-links-resolver.ts` — read-through pipeline: cache → MB → ISRC alias → Odesli → write-through
- `lib/host.ts` — `canonicalHost(host)` for cache dedup (strips `www.` / `m.` / `open.` / etc.; non-server-only so client components can import)
- `lib/favicon.ts` — `faviconUrl(host)` / `faviconHost(host)` with per-tenant rewrites (Bandcamp subdomains → `bandcamp.com`)

### Components
- `components/ui/` — shadcn primitives + custom `tooltip.tsx`, `icon-tooltip.tsx`
- `components/achordion/` — application components (track lists, charts grids, sidebars, hero cards, etc.). Notable patterns:
  - `play-on-hover-fab.tsx` — universal album-grid hover play button
  - `parachord-button.tsx` — `<ParachordCtaButton>`, `<ParachordPlayButton>`, `<PlayOverNumberCell>`
  - `open-in-parachord-button.tsx` — playlist / radio / import variants
  - `streaming-links-row.tsx` — client-island favicon row that server-renders MB rels then upgrades from cache via `/api/track-links`
  - `inline-track-links.tsx` — per-row click-to-expand favicon pill (lazy `/api/track-links` fetch on click)
  - `entity-header-stats.tsx` — shared big-numbers listens / listeners block for artist / album / track headers
  - `relative-time.tsx` — hydration-stable "X ago" wrapper + pure helpers
  - `embed-share-button.tsx` — copy-ready iframe snippet dialog (track + album)
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
9. **Don't add `<OdesliLinks>` to new code.** It bypasses the track-links cache and the ISRC alias path. Use `<StreamingLinksRow>` (client island) or `resolveTrackLinks()` (server-side) instead.
10. **Don't render `relativeTime(...)` directly inline.** Use `<RelativeTime value={...} />` so the SSR/CSR clock-drift mismatch gets `suppressHydrationWarning` automatically. Mixed-text parents can take `suppressHydrationWarning` directly if there are multiple relative-time children.
11. **Don't render listens / listeners stats inline.** Use `<EntityHeaderStats totalListens totalListeners />` from `components/achordion/entity-header-stats.tsx` — three pages used to define duplicate copies of the block.
12. **Don't `await fetch()` a third party without a timeout.** Use `fetchWithTimeout` (`lib/fetch-timeout.ts`) / `mbFetch`. A hang in a render path wedges the page and `.catch()` won't save you — see "Render resilience" above.
13. **Don't let a per-request Upstash/Redis read throw uncaught** (especially in middleware). Catch and return the permissive default — fail open.
14. **Don't prefetch high-cardinality grid links.** Dense entity-link grids set `prefetch={false}`; an un-throttled prefetch wave trips Vercel request-shedding (503s) and silently breaks navigation.
15. **Don't add a sequential `await` of slow/serialized data ahead of an entity page's first paint.** Await only the minimal blocking fetch, stream the rest via Suspense + unawaited promises (release-group page is the reference).

---

## Dynamic Open Graph / Twitter cards

Every entity route ships a colocated `opengraph-image.tsx` next to its `page.tsx` — `app/(app)/artist/[mbid]/opengraph-image.tsx`, `…/release-group/[mbid]/…`, `…/recording/[mbid]/…`, `…/playlist/[mbid]/…`, `…/user/[name]/…`. Next renders these into PNGs via `next/og`'s `ImageResponse` and auto-injects them into the page's `<meta property="og:image">` tag at build/render time.

**Edge-sandbox constraints** apply to every file:
- Inline styles only — no Tailwind classes.
- No `server-only` imports inside the OG file. The helpers it calls (LB / MB clients, the bsky display helper, `caaReleaseUrl`) are fine because they don't pull in `server-only` themselves; double-check before importing anything new.
- Plain `<img>` is correct — the linter's `@next/next/no-img-element` doesn't apply inside ImageResponse JSX, and `next/image` won't compile in this sandbox.
- CAA URLs that 307-redirect to archive.org work fine; `ImageResponse` follows redirects.
- MB / LB / Bluesky failures must fall through to a generic Achordion-branded card — never throw. Scrapers always need a valid PNG.

**Per-page openGraph metadata** is separate from the image and MUST be set in `generateMetadata` on each entity page. The root layout sets a static `openGraph.title = "Achordion"` that otherwise leaks to every page — Meta then dedupe-caches "no preview" across the whole site. Each entity page returns:

```ts
return {
  title,
  description,
  openGraph: { title, description, type: "music.song" | "music.album" | "profile" | "music.playlist" },
  twitter: { card: "summary_large_image" as const, title, description },
};
```

`og:type` choice matters for Meta's richer-card categorisation: `music.song` for recordings, `music.album` for release-groups, `profile` for artists + users, `music.playlist` for playlists. Twitter inherits `summary_large_image` from the root but each page still sets `twitter.title` + `twitter.description` for distinct cache entries per URL.

**Link-preview crawler allowlist** is symbiotic across two files:
- `app/robots.ts` has an explicit `allow: /` rule listing every preview UA (facebookexternalhit, Facebot, Twitterbot, LinkedInBot, Slackbot, Discordbot, Bluesky Cardyb, Mastodon, WhatsApp, TelegramBot, Pinterest, redditbot). These overrides win over the wildcard `disallow: /recording/` etc. because robots.txt rule-matching is most-specific-UA-wins.
- `middleware.ts` mirrors the same set in an `ALLOWLIST_UA` regex that short-circuits at the top of the middleware, ahead of the ASN block + rate limit. Meta's Sharing Debugger sometimes routes through datacenter IPs that overlap our `BLOCKED_ASNS` set; the short-circuit ensures we never accidentally 403 a known preview crawler.

When adding a new entity route that should be shareable, check **both** files have the UA list intact and add the new `opengraph-image.tsx` + `generateMetadata` openGraph block alongside the page.

---

## Embed widgets

Iframe-friendly widgets at `/embed/track/<mbid>` (180px) and `/embed/album/<mbid>` (260px). Designed for third-party pages — no site nav, no auth, identical HTML for every visitor so the response is safe to edge-cache.

- **CSP exception** at `/embed/:path*` in `next.config.ts` swaps `frame-ancestors 'self'` for `frame-ancestors *`. Other security headers still apply.
- **Both widgets server-await `resolveTrackLinks`** rather than using the client-island pattern. Iframe context favors no-JS rendering; the cache + Odesli path produces a fast SSR cycle on warm cache hits.
- **Native `title=` tooltips** on favicons (not the popover `<IconTooltip>`) because popover tooltips clip at the iframe boundary. CSS-only label spans positioned `bottom-full` are the alternative pattern when we want richer copy (album embed uses this above the favicons; track embed uses native title).
- **Album embed has a `<details>` accordion** with the full tracklist, each row carrying its own `<InlineTrackLinks>` click-to-expand pill. Pure HTML, no JS hydration cost.
- **Title / album links use `target="_top"`** so clicking from inside an iframe breaks out to `https://achordion.xyz/<entity>/<mbid>` rather than navigating inside the iframe.

`<EmbedShareButton entity="track|album" mbid={...} />` is the in-app affordance that shows the copy-ready iframe snippet (see `components/achordion/embed-share-button.tsx`). Lives in the `afterTitle` row on entity pages alongside the streaming favicons.

---

## Changelog convention

`/changelog` (`app/(content)/changelog/page.tsx`) is a curated, day-by-day list of user-visible improvements — not a 1:1 mirror of git log. The data lives in a typed `ENTRIES: ChangelogEntry[]` array at the top of the file; add new days at the **head** of the array as you ship them.

Each entry needs a `date` (ISO `YYYY-MM-DD`), an optional one-line `intro` framing the day's theme, and an array of `highlights` strings. Keep the language at the level a regular visitor would notice — what's actually different for them as a listener — not engineering minutiae. The page comment in the file restates the curation criteria; lean on that when in doubt.

Footer link is in `components/layout/site-footer.tsx`.

---

## Workflow notes

- `npm run dev` for local. **Both dev AND the production build use webpack, not Turbopack.** See the next subsection for the why.
- **Typecheck before committing:** `npx --no-install tsc --noEmit`. The project ships TS strict.
- **Lint:** `npx --no-install eslint <files>`.
- **Smoke tests:** `npm run e2e` runs the Playwright suite under `tests/e2e/` against a fresh `next build && next start` boot. The same suite runs against an arbitrary deployment via `E2E_BASE_URL=https://… npm run e2e` (skips the local web server). CI runs it on every PR + push to main via `.github/workflows/e2e.yml`. Coverage is intentionally a small surface area: static pages, charts, one canonical artist/release-group/recording, and the utility routes (robots, sitemap, OG image, auth providers). Add to it when you find a regression class the existing specs would have caught.
- Commits follow a focused-and-themed style — see `git log --oneline` for the cadence. Subject lines describe what the user-facing change does, not the implementation.
- Do not amend commits unless explicitly requested.
- Production deploy is Vercel from `main`; the WS-to-localhost approach works in production because Chrome / Edge / Firefox treat `ws://127.0.0.1` as a "potentially trustworthy origin" exception from mixed-content blocks.

### Why both dev and the prod build run webpack, not Turbopack

There are **two independent** Turbopack-on-Next-16 problems behind this. Either one alone justifies the `--webpack` flag; together they make it non-negotiable for now.

**Problem 1 — dev-cache class drop (affects `next dev`).** Turbopack + Tailwind v4 + Next 16 had a recurring dev-cache class drop: a fresh utility (`sm:inline-flex`, `z-30`, `max-w-[24ch]`, `lg:grid-cols-[minmax(0,1fr)_280px]`, etc.) would be missing from the served CSS even though the class string was right there in the TSX file. Symptom: ships fine in production, broken on localhost. Fixing each occurrence cost a stop-server / `rm -rf .next` / restart cycle, and that *still* didn't always evict the bad scan state.

**Problem 2 — dead RSC chunk references (affects `next build`).** The Turbopack *production* build emitted dead chunk references: the streamed RSC payload told React to load a chunk filename (e.g. `0y_u54ge.f3ju.js`) that the bundler never wrote to disk on **any** deployment. The browser 404s the chunk (served as `text/plain`, so also "Refused to execute script" + CORB noise), React's loader retries with exponential backoff, and page hydration stalls ~7s before falling through. This was misdiagnosed twice as a server-only type-import leak and then as Vercel deploy skew — it is neither. Confirmed by curling the failing chunk against every recent deployment ID (404 everywhere, including the deploy that served the HTML; Skew Protection was already on). The `turbopack-*.js` runtime chunk in the page source was the tell that the prod artifact was Turbopack-built.

The fixes, together:

1. **`npm run dev` uses `--webpack`** and **`npm run build` uses `--webpack`.** `npm run dev:turbo` / `npm run build:turbo` stay wired up for testing whether a future Next release has fixed either bug — when both are confirmed fixed upstream, flip `build`/`dev` back to Turbopack for the faster builds. Trade-off today: webpack prod builds take ~2-3× longer on Vercel (~1m vs ~40s), which is an easy trade against 7-second user hydration stalls.
2. **`globals.css` pins `@source "../app"`, `@source "../components"`, `@source "../lib"`.** Default Tailwind v4 source detection is heuristic-based and would occasionally miss edits; explicit paths force a deterministic scan tree (helps Problem 1).

**Gotcha when flipping the build flag:** Turbopack's build was *not* running the same route-type check webpack does. The switch surfaced a latent error — `app/api/search/route.ts` exported a helper (`parseSearchQuery`) alongside its `GET` handler, which makes the file fail Next's "Route does not match the required types" check under webpack. `route.ts` files may only export route handlers (`GET`/`POST`/…) and known route config; move any helper to a sibling module (or unexport it if only used in-file). If you re-enable Turbopack later and then switch back, watch for this class of error reappearing.

If you ever hit the **dev** class-drop symptom again on webpack:

1. Stop the dev server.
2. `rm -rf .next` (plus `.turbo` and `node_modules/.cache` if either exists).
3. Restart.
4. Hard-reload the browser.
