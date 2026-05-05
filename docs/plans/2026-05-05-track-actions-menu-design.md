# Track Actions Menu — Design

A per-row overflow (⋮) menu surfacing track-level ListenBrainz write actions
across the app's track-rendering surfaces.

## Scope (v1)

| Action            | Endpoint                                       | Notes                                      |
|-------------------|------------------------------------------------|--------------------------------------------|
| Love / Unlove     | `POST /1/feedback/recording-feedback`          | needs `recording_mbid`                     |
| Pin track         | `POST /1/pin`                                  | MBID or MSID; modal w/ optional blurb      |
| Recommend         | `POST /1/recommend-personal-recording`         | submenu: All followers / Choose people…    |
| Add to playlist   | `POST /1/playlist/{mbid}/item/add`             | submenu of recent + "+ New playlist…"      |
| Add to queue      | `parachord://queue/add?artist=…&title=…`       | client-side; no LB call                    |
| Delete listen     | `POST /1/delete-listen`                        | only when listen owner === viewer          |

**Deferred to v1.1:** Write a Review (CritiqueBrainz OAuth is its own piece of work).
**Out of scope:** hate (`score: -1`), bulk multi-select, search-results placement.

## Component shape

`components/achordion/track-actions-menu.tsx` — single client component built
on the existing `components/ui/dropdown-menu.tsx` primitive. Returns `null`
for signed-out viewers (so it can drop into any track row without conditional
wrapping).

```ts
type TrackRef = {
  recordingMbid?: string | null;
  recordingMsid?: string | null;
  trackName: string;     // always present
  artistName: string;    // always present
  releaseMbid?: string | null;
  // Listen-specific (only when this row is a real listen):
  listenedAt?: number;
  ownerUsername?: string;
};
```

**Visibility rules** are evaluated per item from props alone:

- Delete-listen renders only when `listenedAt && ownerUsername === viewer`.
- MBID-required items (Love, Recommend, Add-to-playlist) render
  disabled-with-tooltip when only `recordingMsid` is present.
- All token-gated items remain *visible* when no LB token is configured;
  click triggers `<NeedsTokenPopover>` instead of firing the action.

## Surfaces in v1

- `components/achordion/live-scrobble-list.tsx` — pass `listenedAt` + `ownerUsername`.
- Playlist track rows — recording context, no listen identity.
- Entity tracklists (artist top-tracks, album tracklist, recording-page sibling lists).

Search results and other surfaces come later.

## Menu structure

```
─── Track ─────────────────
  ♥  Love track / Unlove
  📌 Pin track…                   (opens blurb modal)
  📣 Recommend                ›   (submenu)
─── Add ──────────────────
  ＋ Add to playlist          ›   (submenu)
  ▶  Add to Parachord queue
─── Tools ────────────────
  ✎  Write a review… (Coming soon, disabled)
  🗑  Delete listen…              (own listens only)
```

## Sub-flows

Co-located in `components/achordion/track-actions/`:

- **`<PinTrackDialog />`** — 240-char textarea + counter + optional `pinned_until` date; submits `pinTrackAction`.
- **`<RecommendDialog />`** — searchable, virtualized follower checklist (lazy-loaded); max 50 recipients; submits `recommendTrackAction`.
- **`<AddToPlaylistSub />`** — `DropdownMenuSub` listing 10 most-recently-edited playlists + "+ New playlist…" (opens `<NewPlaylistDialog />`). Optimistic checkmark, revert on error.
- **`<NeedsTokenPopover />`** — shown in place of firing a token-gated action when no LB token is configured. Links to `/settings/connections`.
- **Delete confirm** — single shared `<AlertDialog />` parameterized by action.

## Data layer

All write actions in `app/(app)/track/actions.ts` (`"use server"`), using the
existing `EditResult` discriminated-union pattern from
`app/(app)/playlist/[mbid]/actions.ts`:

```ts
type Result = { ok: true } | { ok: false; reason: string };
```

Each action shares a `requireUserToken()` helper that returns
`{ token, viewer } | { error }`.

| Server fn                  | LB endpoint                                  |
|----------------------------|----------------------------------------------|
| `feedbackTrackAction`      | `POST /1/feedback/recording-feedback`        |
| `pinTrackAction`           | `POST /1/pin`                                |
| `recommendTrackAction`     | `POST /1/recommend-personal-recording` (batched per recipient) |
| `addToPlaylistAction`      | `POST /1/playlist/{mbid}/item/add`           |
| `createPlaylistAction`     | `POST /1/playlist/create` then add-item      |
| `deleteListenAction`       | `POST /1/delete-listen`                      |

**New read functions in `lib/clients/listenbrainz.ts`:**

- `getUserPlaylists(username, count=10)` — for the playlist submenu.
- `getUserFollowers(username)` — for the recommend picker.
- `getUserLovedRecordings(username)` — for love-state cache.

**Cache invalidation:** after each successful write, `revalidateTag()` on
`lb:user:{viewer}:playlists`, `lb:user:{viewer}:loved`, or `lb:user:{viewer}:listens`
as appropriate. Delete-listen also optimistically updates the live-scrobble-list
state.

## Feedback & state

**Toasts** on every action without its own dialog confirmation. Wording:
"Loved · Undo", "Pinned · View on profile", "Recommended to 3 followers".
Undo wired only for Love and Add-to-playlist (cheap to reverse); Delete already
had its confirm step.

**Optimistic UI:**

- Love → heart fills immediately; revert on error.
- Add-to-playlist → submenu checkmark immediately; revert on error.
- Delete listen → row animates out of the live scrobble list immediately; restore on error.

Pin and Recommend rely on the toast alone (no inline state to flip).

**Loved-state cache:** `<LovedTracksProvider>` at the app root fetches
`getUserLovedRecordings(viewer)` once per session and exposes `isLoved(mbid)` +
`setLoved(mbid, score)`. Without this, every menu render either over-fetches
or shows the wrong heart.

**Errors:** server actions return `{ ok: false; reason }`; the client maps
`reason` to the toast. Network/transport errors throw and are caught with a
generic "Something went wrong" toast.

## Out of scope for v1

- CritiqueBrainz OAuth + review composer (deferred to v1.1)
- `score: -1` (hate) — action layer is score-agnostic, no menu item
- Bulk multi-select operations
- Search-results placement
- Telemetry
