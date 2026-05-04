# Achordion Design System

The visual grammar Achordion is built on. Pair this with [**AGENTS.md**](./AGENTS.md), which covers the engineering rules (RSC boundaries, MBID-from-cover-lookup pattern, image-fade rules, etc.). This doc covers the *visual* side: what color goes where, which type style to reach for, which component is canonical, and when to use which pattern.

If you're adding something new and it doesn't already match a pattern here, **consider whether the new pattern belongs in this doc** before scattering it across files. Drift is the failure mode this document exists to prevent.

---

## Contents

1. [Color](#color)
2. [Typography](#typography)
3. [Spacing & layout](#spacing--layout)
4. [Imagery](#imagery)
5. [Motion](#motion)
6. [Iconography](#iconography)
7. [Components](#components)
8. [Patterns](#patterns)
9. [When to reach for which](#when-to-reach-for-which)
10. [Dark mode](#dark-mode)
11. [Open work](#open-work)

---

## Color

Colors live in `app/globals.css` as CSS variables. The semantic shadcn tokens (`background`, `foreground`, `muted`, etc.) are sourced from there; raw hex values appear inline only for the brand-specific colors that don't have CSS variables yet (see [Open work](#open-work)).

### Brand colors

| Name | Value | Where it goes | Where it does NOT go |
|---|---|---|---|
| **Achordion wordmark accent** | `#774BE9` | Inside `<WordmarkMark>` only. Two purple accent rectangles in the SVG. | Anywhere else. This is the brand-mark color, not a UI accent. |
| **Parachord accent** | `#7c3aed` | Every "Play in Parachord" surface — `<PlayOnHoverFab>`, `<ParachordCtaButton>`, `<OpenInParachordButton>`, `<LbRadioSection>`'s `--play-bg`, the running-state DiceBear shape accent, the `<global-error>` retry button. | Anywhere unrelated to "this clicks into Parachord." |

Why two purples: the wordmark mark was designed independently in a slightly more saturated violet than Tailwind's `violet-600`. They look close enough at a glance that you might be tempted to use one for the other. **Don't.** The wordmark is identity, the Parachord accent is functional. Mixing them muddies both.

The Parachord accent matches the resting color of Parachord's queue badge (verified against `parachord-desktop/index.html:489`). When Parachord and Achordion are open in adjacent tabs, the same hue should anchor both.

### Sidebar palette (the nine-color set)

The colorful per-section accents Parachord uses to highlight active sidebar items. Achordion borrows this palette for any surface that needs categorical differentiation: DiceBear avatar backgrounds, chart series colors, anywhere "five+ visually distinct categories" is the requirement.

| Hex | Tailwind | Parachord meaning |
|---|---|---|
| `#7c3aed` | violet 600 | Home (also our Parachord accent) |
| `#ec4899` | pink 500 | Playlists |
| `#06b6d4` | cyan 500 | Library |
| `#3b82f6` | blue 500 | History |
| `#10b981` | emerald 500 | New Releases |
| `#f59e0b` | amber 500 | Recommendations |
| `#f97316` | orange 500 | Discover / Pop of the Tops |
| `#ef4444` | red 500 | Critical Darlings |
| `#10c9b4` | teal | Concerts |

The five-color **chart palette** (`--chart-1`..`--chart-5` in `globals.css`) is the well-separated subset:

| Var | Hex | Hue role |
|---|---|---|
| `--chart-1` | `#7c3aed` | Cool primary (violet) |
| `--chart-2` | `#10b981` | Cool counterpoint (emerald) |
| `--chart-3` | `#f59e0b` | Warm contrast (amber) |
| `--chart-4` | `#3b82f6` | Cool fresh (blue) |
| `--chart-5` | `#ec4899` | Warm-cool accent (pink) |

Pick the next color from the chart palette, not the full nine, when fewer than five series are needed — adjacent series are guaranteed visually distinct.

`lib/dicebear-shapes.ts` consumes the full nine for avatar backgrounds.

### Semantic tokens

The full shadcn token system is set up in `globals.css`. Reach for these instead of hardcoded grays or hexes:

| Token | Pairs with | Notes |
|---|---|---|
| `bg-background` / `text-foreground` | Page chrome, body text | Near-white in light, near-black in dark |
| `bg-card` / `text-card-foreground` | Card surfaces | Elevated surface within a page |
| `bg-popover` / `text-popover-foreground` | Tooltips, dropdowns | Same colors as card by default |
| `bg-muted` / `text-muted-foreground` | Quiet backgrounds, secondary text | Use for chip / badge fills, deprioritized labels |
| `bg-primary` / `text-primary-foreground` | Solid filled buttons | The shadcn "filled" button variant |
| `bg-accent` / `text-accent-foreground` | Hover states, ghost buttons | Subtle hover affordance |
| `border-border` | Hairline rules, card edges | Use `border-border/60` for the standard 60% softness |
| `bg-destructive` | Destructive action buttons | Red, used sparingly |

**Avoid `text-muted-foreground/70`** combined with `text-xs` — the dual softening drops the rendered contrast below WCAG AA on light mode (Lighthouse confirmed). Use plain `text-muted-foreground` if it needs to be small. Audit fix landed in `5e3a795`.

### Editorial inline links

For body-copy links — content pages (/about, /faq, /donate, /), FAQ inline references, footer attribution — use the canonical `LINK_CLASS`:

```ts
const LINK_CLASS =
  "text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 underline underline-offset-4 decoration-sky-600/40 hover:decoration-current dark:decoration-sky-400/40";
```

Permanent underline, sky-blue, soft decoration that firms up on hover. Don't drop the underline (WCAG fail) and don't change the color — sky reads as "external reference" and stays out of the way of the Parachord accent.

For navigational links inside lists / chips / cards (anywhere the *position* + the *bordering surface* makes the link obvious), use plain `hover:underline`. The editorial style is for prose specifically.

---

## Typography

Font stack: **Geist Sans** for everything, **Geist Mono** for tabular numerals and `<code>`. Loaded via `next/font/google` in `app/layout.tsx`. `--font-heading` is aliased to the same Geist Sans in `globals.css` — there is no separate display face right now.

### Type scale

Follow the existing usage rather than inventing new sizes. Patterns that already exist in the app:

| Role | Class | Used at |
|---|---|---|
| **Hero H1** | `font-heading text-5xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl md:text-7xl` | `/` only |
| **Page H1** | `text-3xl font-semibold tracking-tight text-balance sm:text-4xl` | `<PageHeader>` everywhere else |
| **Section H2 (uppercase)** | `text-sm font-semibold tracking-wide uppercase` | `<Section>` titles in /about, /faq |
| **Eyebrow** | `text-xs tracking-wide uppercase text-muted-foreground` | Above titles in `<PageHeader>`, on home |
| **Card title** | `text-lg font-semibold tracking-tight` | Feature cards on /, similar |
| **Body prose** | `text-base leading-7` | Long-form content (/about, /faq) |
| **UI body** | `text-sm` | Buttons, lists, most controls |
| **Tertiary metadata** | `text-xs text-muted-foreground` | Counts, dates, "5h ago" |
| **Tabular numbers** | `tabular-nums` | Anywhere numbers stack vertically |

### Rules

- **Always pair `tracking-tight` with semibold-or-bolder display sizes.** The Geist family widens too much at large sizes without it.
- **Never use `text-balance` on body prose** — it's deliberate on H1s only, where it pulls the "widow" behavior into the title block. Body text should wrap naturally.
- **`leading-7` for body, `leading-6` for compact UI text, `leading-tight` for display headlines.** Don't invent new line-heights without a reason.

---

## Spacing & layout

### Page rails

| Rail | Class | Use for |
|---|---|---|
| **Full-bleed page** | `mx-auto max-w-7xl px-4 sm:px-6` | Default page container (`<PageShell>`) |
| **Reading column** | `max-w-2xl` (672 px) | Long-form prose on /about, /faq, /donate |
| **Headline column** | `max-w-3xl` (768 px) | Hero H1 on / |

The headline rail is *deliberately wider* than the reading rail so display type can breathe. Don't reuse `max-w-3xl` for body.

### Vertical rhythm

- **Page header pad**: `pt-8 pb-6` (the `<PageHeader>` component does this)
- **Section spacing inside a page**: `space-y-12` between Sections, `space-y-3` or `space-y-4` inside a Section
- **Hero pad**: `pt-20 pb-16 sm:pt-28 sm:pb-24` on the home

### Avatar / cover sizes

| Class | Rendered | Use |
|---|---|---|
| `size-7` | 28 px | Site-header user avatar, list density |
| `size-9` | 36 px | Compact list rows, settings rows |
| `size-12` | 48 px | Standard track-row covers in charts/lists |
| `size-16` | 64 px | Sidebar avatars |
| `size-20` / `size-24` | 80 / 96 px | Artist-page hero avatar (responsive) |

---

## Imagery

All async-loaded image surfaces share a 300 ms ease-out fade-in. Wrappers:

| Component | Use for |
|---|---|
| `<CoverArt>` | Cover-art images. Has built-in `onError` swap to `Disc3` placeholder. **Use this even when the URL is known-good** — see AGENTS.md rule 9. |
| `<LazyAlbumCover>` | Album covers in chart grids and lists where the URL needs resolving via `/api/track-cover`. |
| `<LazyTrackCover>` | Track-row covers (Radio Rewind etc.) where the URL needs resolving. |
| `<FadeInImage>` | Drop-in for raw `<Image>` when the image's host is known and `<CoverArt>`'s shape doesn't fit (Apple Music inline `artworkUrl`). |
| `<AvatarImage>` (from `components/ui/avatar.tsx`) | User / artist avatars. Mounts the underlying `<img>` only after load, so the fade is implicit via `animate-in fade-in duration-300`. |
| `<LazyArtistAvatar>` | Artist avatars where the photo URL needs Wikidata resolution (search typeahead). |

**Never use raw `<img>` or `<Image>` for content imagery** without one of these wrappers. AGENTS.md rule 9 has the rationale.

For new image surfaces, see also AGENTS.md rule 11 (placeholder-and-swap pattern) and rule 2 (piggyback the cover lookup to learn the entity MBID).

---

## Motion

### Durations

| Duration | Use |
|---|---|
| **150 ms** | Hover-state transitions on buttons, links, color changes |
| **200 ms** | UI state shifts — open/close of small surfaces |
| **300 ms ease-out** | Image fade-in (the canonical async-load fade) |

### Affordances

- Buttons should always have a `transition-colors` class so hover doesn't snap.
- Cover-on-hover play overlays (`<PlayOnHoverFab>`) use both opacity and a small `translate-y-1 → translate-y-0` movement on hover. Keep the same 200 ms.
- Don't introduce new animation timings without checking the existing palette first.

---

## Iconography

**Lucide React** (`lucide-react`) is the only icon library. Sizes:

| Class | Use |
|---|---|
| `size-3` | Inline-text icons inside `<a>` links and chips |
| `size-3.5` | Slightly larger inline icons (heart in donate link, etc.) |
| `size-4` | Standard button-icons, nav-icons, leading icons in mobile-extras |
| `size-5` | Section-header decorations (feature-card icons on /) |

**Don't reach for emojis** as iconography. The single emoji in `site-footer.tsx` (the `❤️` in "Made with ❤️") is intentional editorial flourish, not a precedent.

---

## Components

The components below are the **canonical primitives**. Use these instead of re-implementing the patterns inline.

### Layout

| Component | What it does |
|---|---|
| **`<PageShell>`** | Default page container. `mx-auto max-w-7xl px-4 sm:px-6 pb-16`. Wrap every route's main content in this. |
| **`<PageHeader>`** | Eyebrow + breadcrumbs + title + description trio for every top-level page. Optional `leading` slot for hero avatar, `actions` for trailing buttons, `afterTitle` for inline metadata. |
| **`<SiteHeader>`** | The fixed top header. Don't render `<MainNav>` directly; the header wires up auth state and mobile sheet. |
| **`<SiteFooter>`** | The footer with attribution + nav links. |

### Navigation

| Component | What it does |
|---|---|
| **`<MainNav>`** | Top-nav with desktop nav-bar + mobile sheet. Lives inside `<SiteHeader>`. |
| **`<SectionTabs>`** | Underline-style sub-tabs. Use for *navigating between sections of content* — artist sub-tabs, profile sub-tabs, explore sub-tabs. |
| **`<PillSwitch>`** | Segmented-control pill toggle. Use for *binary or ternary view-mode choices* — Followers ↔ Following, etc. |
| **`<Breadcrumbs>`** | The breadcrumb trail. Slot it into `<PageHeader>` via the `breadcrumbs` prop, not standalone. |

### Content surfaces

| Component | What it does |
|---|---|
| **`<Section>`** (in /about and /faq today, not yet extracted) | Pattern: H2 (uppercase) + body. Currently re-implemented per page; should be extracted soon — see [Open work](#open-work). |
| **Card** (Tailwind class group) | `border-border/60 bg-card/30 rounded-xl border p-5`. Bio cards, settings cards, info-card surfaces. No component — apply the classes directly. |
| **`<Tooltip>`** + **`<TooltipContent>`** | Radix-based tooltip. Used for hover affordances that require interaction (multi-line content, links inside the tooltip). |
| **`<IconTooltip>`** | CSS-only tooltip for simple labels on icon buttons. Cheaper hydration cost than full Radix. Reach for this first; only use the Radix `<Tooltip>` when you need rich content. |

### Action affordances

| Component | What it does |
|---|---|
| **`<Button>`** | The base button. Variants: default (filled), `ghost` (transparent), `outline`, etc. Use `nativeButton={false}` + `render={<Link href=...>}` to render an anchor instead of a button. |
| **`<PlayOnHoverFab>`** | Bottom-right floating play button on every cover-art tile. Two states: connected (Parachord accent) / not connected (muted + tooltip CTA). |
| **`<ParachordCtaButton>`** | The main "Open in Parachord" CTA. Same two-state behavior. |
| **`<OpenInParachordButton>`** | Inline / secondary variant of the Parachord CTA. |

### Scroll / list

| Component | What it does |
|---|---|
| **`<ScrollableRow>`** | Horizontal-scrolling row used by chart strips, top-tracks lists. Handles nav buttons + scroll snap. |
| **`<RecentSearches>`** / **`<RecentStations>`** | localStorage-backed chip rows for the search and radio surfaces. |

---

## Patterns

The recurring layouts that aren't (yet) components.

### Track row

A cover (40-48 px) on the left, title + artist stacked to the right, optional trailing actions / metadata. Used in 9+ places across charts, recent listens, top tracks.

**Canonical structure**:

```tsx
<li className="group flex items-center gap-3 py-3">
  <span className="text-muted-foreground w-6 shrink-0 text-xs tabular-nums">
    {index + 1}
  </span>
  <a
    href={parachordPlayTrack({ artist, title })}
    className="group/cover relative shrink-0 overflow-hidden rounded-md"
  >
    <CoverArt {...} className="size-12" />
    <PlayOnHoverFabOverlay />
  </a>
  <div className="min-w-0 flex-1">
    <p className="truncate text-sm font-medium">
      <Link href={recordingHref({...})} className="hover:underline">
        {title}
      </Link>
    </p>
    <p className="text-muted-foreground truncate text-xs">
      <Link href={artistHref({...})} className="hover:text-foreground">
        {creator}
      </Link>
    </p>
  </div>
</li>
```

The cover wraps a Parachord deep-link (clicks play); the title and artist text wrap entity links (click to navigate). One row, two click targets. AGENTS.md rule 1 (every name is a click target) and rule 2 (lookup-vs-cover-piggyback) cover the link-href construction.

### Album-grid card

Larger cover, rank badge top-left, hover-fab bottom-right, title + artist stacked below. Used by `<ChartsAlbumCard>` (Apple Music + ListenBrainz + College Radio chart grids).

### Hero (home)

Two-column on `lg+`:
- Left column: eyebrow → H1 → 1-2 body paragraphs → CTA cluster
- Right column: product screenshot, capped at `560 px`, soft border + shadow

Below `md`, the screenshot hides — the column collapses to single-column copy + CTAs only.

### Card

`border-border/60 bg-card/30 rounded-xl border p-5`. Used for:
- The bio block on artist pages
- Settings cards (music services, scrobbler tokens, danger zone)
- Listen-along consent dialog
- Etc.

**Don't introduce non-rounded variants** — the soft `rounded-xl` is part of the visual rhythm.

### Eyebrow → title → description trio

`<PageHeader>` does this for top-level pages. **Inside** a page, the same trio sometimes appears for content sections; reach for an `<h2>` with `text-sm font-semibold tracking-wide uppercase` and a body `<p className="text-muted-foreground text-sm leading-7">` underneath.

### Empty state

`<ComingSoon>` is the canonical empty-state placeholder. Title + body + optional icon. Don't roll your own "no data" markup.

---

## When to reach for which

The decisions that have come up enough to bake into rules.

### Pill switch vs section tabs

- **`<PillSwitch>`** — choosing a view of the same content (Followers ↔ Following). Reads as "toggle view".
- **`<SectionTabs>`** — navigating between sections of content (Listens / Stats / Pins / Loves on a profile). Reads as "browse sections".

### Tooltip vs IconTooltip

- **`<IconTooltip>`** — short label on an icon button. Cheaper to render, no Radix slot chain. Reach for this first.
- **`<Tooltip>`** — multi-line, rich content, or anything containing a link the user might click.

### Underlined link vs plain link

- **`LINK_CLASS`** (sky-600 + permanent underline) — links inside body prose where the link target is *external* or *navigational-not-actionable* (going to a different concept, not a different view of the same data).
- **`hover:underline`** (no color shift) — links inside lists, cards, chips, and any context where the surrounding container makes the click target obvious.

### `<Image>` vs `<CoverArt>` vs `<FadeInImage>` vs `<LazyAlbumCover>`

See the [Imagery](#imagery) table. The short version: never raw `<img>` or `<Image>` for content imagery; pick the wrapper whose shape and resolution behavior matches.

### `force-static` vs streaming

`/about`, `/faq`, `/donate`, `/login` are static markup — they should be `force-static` once we split them out of the `(app)` route group (Issue #8). Everything else streams. `<Suspense>` boundaries should wrap data-dependent slots — see AGENTS.md rule 11.

### Parachord accent vs Achordion brand

- **Parachord accent** (`#7c3aed`) — Play affordances. *Functional* color.
- **Achordion brand** (`#774BE9`) — Wordmark only. *Identity* color.

Don't cross the streams.

---

## Dark mode

Every shadcn semantic token has a `.dark` variant. The brand colors and the chart palette **don't** — they use the same hex in both modes since 500/600-level Tailwind hues read fine on either background.

Dark-mode considerations:
- `<CoverArt>` on dark uses a `bg-muted` placeholder which is darker than the light-mode equivalent. The visual rhythm stays consistent.
- The home-hero product screenshot uses `shadow-black/40` instead of `shadow-black/10` so the elevation reads on dark.
- `text-muted-foreground/70` (which we should avoid anyway — see [Color](#semantic-tokens)) is *especially* problematic in dark mode where the contrast collapses faster.

When adding new components, always probe both modes via the theme toggle before merging.

---

## Open work

Things this doc points at that aren't fully baked yet:

1. ✅ **Brand colors lifted into CSS variables** (`--parachord-accent`, `--achordion-brand`). Done.
2. ✅ **Sidebar palette as CSS variables** (`--palette-violet`, `--palette-pink`, etc.). Done.
3. ✅ **`<ContentSection>` extracted** to `components/achordion/content-section.tsx`. Done.
4. **`<EmptyState>`** — `<ComingSoon>` is the de-facto empty state but has a name that ties it to one specific use. Rename + extract for general use. Tracked in [Issue #10](https://github.com/jherskowitz/achordion/issues/10).
5. **Heading hierarchy audit.** Lighthouse caught `<h1> → <h3>` skips on the home (fixed). Worth a sweep across every page once: `h1` only at page top, `h2` for section headings, `h3` only where the structure actually demands it. Tracked in [Issue #11](https://github.com/jherskowitz/achordion/issues/11).

If you spot a pattern that's recurring without a name, **add it here first**, then refactor the codebase to match. The doc is the contract.

---

## Cross-references

- [**AGENTS.md**](./AGENTS.md) — Engineering rules. Where this doc says "use `<CoverArt>`", that one says *why* (`onError` swap, no broken-image flicker).
- [**`app/globals.css`**](./app/globals.css) — Source of truth for color tokens, radius scale, font assignments.
- [**`tailwind.config.ts`** / **`shadcn/tailwind.css`**] — Tailwind + shadcn token wiring. Don't edit unless adding a new top-level token.
- [**`components/ui/`**](./components/ui) — shadcn primitives (Button, Avatar, Tooltip, Sheet, etc.). Copy-pasted from shadcn/ui at install time, edited freely from there.
- [**`components/achordion/`**](./components/achordion) — Achordion-specific components. Most of the cross-cutting visual primitives (`<CoverArt>`, `<PageShell>`, `<PageHeader>`, `<PillSwitch>`, etc.) live here.
