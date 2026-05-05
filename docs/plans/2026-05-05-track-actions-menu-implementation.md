# Track Actions Menu — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship a per-row track-actions overflow menu (⋮) across the live scrobble list, playlist tracks, and entity tracklists, wiring up Love, Pin, Recommend, Add-to-playlist, Add-to-Parachord-queue, and Delete-listen against ListenBrainz write endpoints.

**Architecture:** A single client component `<TrackActionsMenu />` built on `components/ui/dropdown-menu.tsx`. Server actions in `app/(app)/track/actions.ts` mirror the existing `EditResult` pattern from [`app/(app)/playlist/[mbid]/actions.ts`](../../app/(app)/playlist/[mbid]/actions.ts). LB read/write functions added to [`lib/clients/listenbrainz.ts`](../../lib/clients/listenbrainz.ts). Loved-state shared via a session-scoped React context provider.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, shadcn/ui, `@base-ui/react`, `@tanstack/react-query`, Auth.js v5, Zod, `sonner` (to be added).

**Reference docs:**
- Design: [docs/plans/2026-05-05-track-actions-menu-design.md](./2026-05-05-track-actions-menu-design.md)
- Conventions: [AGENTS.md](../../AGENTS.md) — note the Next 16 warning at the top
- Existing pattern: [app/(app)/playlist/[mbid]/actions.ts](../../app/(app)/playlist/[mbid]/actions.ts)
- Token helper: [lib/lb-token.ts](../../lib/lb-token.ts)

**Verification approach:** No test framework is installed. Verify each task with `pnpm tsc --noEmit`, `pnpm lint`, and the `preview_*` MCP tools (snapshot, console, network, screenshot).

---

## Phase 1 — Primitives & dependencies

### Task 1: Add missing shadcn primitives

**Files (create):**
- `components/ui/dialog.tsx`
- `components/ui/alert-dialog.tsx`
- `components/ui/popover.tsx`
- `components/ui/sonner.tsx`

**Steps:**
1. Run `pnpm dlx shadcn@latest add dialog alert-dialog popover sonner` and accept defaults.
2. Inspect each file and confirm they import from `@base-ui/react` (matching the existing `dropdown-menu.tsx`). If shadcn pulls `@radix-ui/react-*` instead, swap to `@base-ui/react` to keep the primitive layer consistent.
3. `git add components/ui/{dialog,alert-dialog,popover,sonner}.tsx package.json pnpm-lock.yaml`
4. `git commit -m "chore: add dialog, alert-dialog, popover, sonner primitives"`

### Task 2: Wire Toaster into root layout

**Files (modify):** `app/layout.tsx` (or `app/(app)/layout.tsx` — pick whichever already wraps providers).

**Steps:**
1. Add `import { Toaster } from "@/components/ui/sonner";`
2. Render `<Toaster />` at the bottom of the body, after the main content.
3. Run `pnpm dev`, open any page in preview, then `preview_eval` to call `toast.success("hi")` from a console message — confirm the toast renders.
4. `git commit -m "chore: mount Toaster in root layout"`

---

## Phase 2 — LB client read/write functions

All in [`lib/clients/listenbrainz.ts`](../../lib/clients/listenbrainz.ts). Each task: add the Zod schema, add the typed wrapper around `fetch`, attach the cache tag, export. Follow the patterns in the existing file.

### Task 3: `getUserPlaylistsForViewer(token, count = 10)`

**Endpoint:** `GET /1/user/{user_name}/playlists` with `Authorization: Token <token>` (so private playlists show too). Response includes a JSPF playlist envelope with creator/title/identifier per playlist.

**Steps:**
1. Add Zod schema for the response (creator, identifier=playlist URL, title, date).
2. Export `getUserPlaylistsForViewer(viewer, token, count)` returning `{ mbid, title, isPublic, lastEdited }[]`.
3. Use cache tag `lb:user:${viewer}:playlists`, `revalidate: 300`.
4. `pnpm tsc --noEmit`
5. `git commit -m "feat(lb): add getUserPlaylistsForViewer"`

### Task 4: `getUserFollowers(username)`

**Endpoint:** `GET /1/user/{user_name}/followers`.

**Steps:**
1. Zod schema (`{ followers: string[] }`).
2. Export typed wrapper. Cache tag `lb:user:${username}:followers`, revalidate 600.
3. `pnpm tsc --noEmit`
4. `git commit -m "feat(lb): add getUserFollowers"`

### Task 5: `getUserLovedRecordings(username, token?)`

**Endpoint:** `GET /1/feedback/user/{user_name}/get-feedback?score=1&count=1000`.

**Steps:**
1. Zod schema for `{ feedback: { recording_mbid, score, created }[] }`.
2. Export `getUserLovedRecordings(username)` returning `Set<string>` of loved recording MBIDs.
3. Cache tag `lb:user:${username}:loved`, revalidate 60.
4. `pnpm tsc --noEmit`
5. `git commit -m "feat(lb): add getUserLovedRecordings"`

### Task 6: `submitFeedback(token, recordingMbid, score)`

**Endpoint:** `POST /1/feedback/recording-feedback` with `{ recording_mbid, score: 0 | 1 | -1 }`.

**Steps:**
1. Add typed POST wrapper. No cache tag (writes don't read).
2. On non-200, throw `LbWriteError(status, body)`.
3. `pnpm tsc --noEmit`
4. `git commit -m "feat(lb): add submitFeedback"`

### Task 7: `submitPin(token, { recordingMbid, recordingMsid, blurb, pinnedUntil })`

**Endpoint:** `POST /1/pin` with `{ recording_msid?, recording_mbid?, blurb_content?, pinned_until? }`.

**Steps:**
1. Validate at least one of MBID/MSID at the function boundary.
2. POST wrapper.
3. `pnpm tsc --noEmit`
4. `git commit -m "feat(lb): add submitPin"`

### Task 8: `submitRecommendation(token, recipient, recordingMbid, blurb?)`

**Endpoint:** `POST /1/recommend-personal-recording` with `{ recording_mbid, users: string[], blurb_content? }`.

**Steps:**
1. POST wrapper. Single call accepts `users` array — let the server fn batch.
2. `pnpm tsc --noEmit`
3. `git commit -m "feat(lb): add submitRecommendation"`

### Task 9: `addRecordingToPlaylist(token, playlistMbid, recordingMbid)`

**Endpoint:** `POST /1/playlist/{playlist_mbid}/item/add` with JSPF body `{ playlist: { track: [{ identifier: "https://musicbrainz.org/recording/<mbid>" }] } }`.

**Steps:**
1. POST wrapper. Reuse the JSPF identifier shape used elsewhere in the file.
2. `pnpm tsc --noEmit`
3. `git commit -m "feat(lb): add addRecordingToPlaylist"`

### Task 10: `createPlaylistOnLb(token, { name, isPublic, recordingMbid? })`

**Endpoint:** `POST /1/playlist/create` with JSPF playlist body. Optional initial track.

**Steps:**
1. POST wrapper. Returns the new playlist MBID.
2. `pnpm tsc --noEmit`
3. `git commit -m "feat(lb): add createPlaylistOnLb"`

### Task 11: `deleteListen(token, recordingMsid, listenedAt)`

**Endpoint:** `POST /1/delete-listen` with `{ listened_at, recording_msid }`.

**Steps:**
1. POST wrapper.
2. `pnpm tsc --noEmit`
3. `git commit -m "feat(lb): add deleteListen"`

---

## Phase 3 — Server actions

### Task 12: Scaffold `app/(app)/track/actions.ts`

**Files (create):** `app/(app)/track/actions.ts`

**Steps:**
1. `"use server"` directive at top.
2. Define `type ActionResult = { ok: true } | { ok: false; reason: string }`.
3. Add `requireUserToken()` helper returning `Promise<{ token, viewer } | { error: string }>` — extracts the auth + lb-token preamble used in `app/(app)/playlist/[mbid]/actions.ts`.
4. Export nothing yet (next tasks add the actions).
5. `pnpm tsc --noEmit`
6. `git commit -m "feat(track-actions): scaffold actions file + requireUserToken"`

### Task 13: `feedbackTrackAction({ recordingMbid, score })`

**Steps:**
1. Implement using `requireUserToken()` + `submitFeedback`.
2. On success: `revalidateTag(`lb:user:${viewer}:loved`)`.
3. Return `ActionResult`.
4. `pnpm tsc --noEmit`
5. `git commit -m "feat(track-actions): feedbackTrackAction"`

### Task 14: `pinTrackAction({ recordingMbid, recordingMsid, blurb, pinnedUntil })`

**Steps:**
1. Implement using `submitPin`.
2. No tag invalidation (pins live on profile, not in cached lists yet).
3. `pnpm tsc --noEmit`
4. `git commit -m "feat(track-actions): pinTrackAction"`

### Task 15: `recommendTrackAction({ recordingMbid, recipients })`

**Steps:**
1. Validate `recipients.length` ≤ 50, > 0.
2. Single call to `submitRecommendation` with the array (LB accepts the full list).
3. Return per-recipient success count if partial: `{ ok: true, sent: n }` — extend `ActionResult` if needed.
4. `pnpm tsc --noEmit`
5. `git commit -m "feat(track-actions): recommendTrackAction"`

### Task 16: `addToPlaylistAction({ playlistMbid, recordingMbid })`

**Steps:**
1. Implement using `addRecordingToPlaylist`.
2. `revalidateTag(`lb:playlist:${playlistMbid}`)` on success.
3. `pnpm tsc --noEmit`
4. `git commit -m "feat(track-actions): addToPlaylistAction"`

### Task 17: `createPlaylistAction({ name, isPublic, recordingMbid? })`

**Steps:**
1. Implement using `createPlaylistOnLb`.
2. `revalidateTag(`lb:user:${viewer}:playlists`)` on success.
3. Return `{ ok: true, playlistMbid }`.
4. `pnpm tsc --noEmit`
5. `git commit -m "feat(track-actions): createPlaylistAction"`

### Task 18: `deleteListenAction({ recordingMsid, listenedAt })`

**Steps:**
1. Implement using `deleteListen`.
2. `revalidateTag(`lb:user:${viewer}:listens`)` on success.
3. `pnpm tsc --noEmit`
4. `git commit -m "feat(track-actions): deleteListenAction"`

---

## Phase 4 — Loved-state cache

### Task 19: `LovedTracksProvider` + `useLoved(mbid)` hook

**Files (create):** `components/achordion/loved-tracks-provider.tsx`

**Steps:**
1. Client component using `@tanstack/react-query` to fetch loved MBIDs for the signed-in viewer once per session via a thin `/api/loved-tracks` route (write that too).
2. Expose `useLoved(mbid): { isLoved, setLoved }` via context.
3. `setLoved` updates the local cache optimistically and is called by the menu after `feedbackTrackAction` succeeds.
4. `pnpm tsc --noEmit`
5. `git commit -m "feat: LovedTracksProvider + useLoved hook"`

### Task 20: Wire provider into the app layout

**Files (modify):** `app/(app)/layout.tsx`

**Steps:**
1. Import and wrap children with `<LovedTracksProvider>`. The provider is a no-op for signed-out users.
2. Verify in preview that the page still renders.
3. `git commit -m "feat: mount LovedTracksProvider"`

---

## Phase 5 — Component shell

### Task 21: `<TrackActionsMenu />` shell

**Files (create):** `components/achordion/track-actions-menu.tsx`

**Steps:**
1. Define `TrackRef` type per the design doc.
2. Component takes `{ track: TrackRef; viewer?: { mbUsername: string } | null }`. Returns `null` if no viewer.
3. Renders a `Button` (icon-only ⋮ with `lucide-react` `MoreVertical`) inside `<DropdownMenu>`.
4. For now, render a single static "Test item" inside.
5. `pnpm tsc --noEmit`
6. `git commit -m "feat: TrackActionsMenu shell"`

### Task 22: Drop the menu into one row of the live scrobble list

**Files (modify):** `components/achordion/live-scrobble-list.tsx`

**Steps:**
1. Pass `viewer` from a server-side `auth()` call down through props (the live scrobble list is already a client component — wrap it with a server component if needed, or pass the viewer username via props from its current parent).
2. For each listen, render `<TrackActionsMenu>` at the right edge of the row with a `TrackRef` built from the listen.
3. `pnpm dev`, open `/`, `preview_snapshot` and confirm the ⋮ button appears once per row when signed-in, and not at all when signed-out.
4. `git commit -m "feat: surface TrackActionsMenu in live-scrobble-list"`

---

## Phase 6 — Menu items (one task per item)

Each task in this phase: add the item, wire the action, add toast feedback, verify in preview.

### Task 23: Love / Unlove

**Steps:**
1. Inside the menu, add an item that toggles based on `useLoved(track.recordingMbid)`.
2. Disabled when `!track.recordingMbid`; tooltip "No MusicBrainz ID for this recording."
3. On click: call `feedbackTrackAction`, then `setLoved` optimistically (flip first, revert on `ok:false`).
4. Toast: `Loved · Undo` / `Removed from loved · Undo`.
5. Verify in preview by signing in, loving a track, refreshing, confirming the heart stays.
6. `git commit -m "feat(track-actions): Love/Unlove item"`

### Task 24: Pin track + `<PinTrackDialog />`

**Files (create):** `components/achordion/track-actions/pin-track-dialog.tsx`

**Steps:**
1. Dialog with a 240-char textarea (counter), an optional date input for `pinnedUntil`, Cancel + Pin buttons.
2. Menu item opens the dialog. On submit: `pinTrackAction`, toast `Pinned · View on profile`.
3. Disabled when neither MBID nor MSID present.
4. Verify in preview.
5. `git commit -m "feat(track-actions): Pin item + dialog"`

### Task 25: Add to Parachord queue

**Steps:**
1. Item label "Add to Parachord queue" with the Parachord icon (reuse from `parachord-button.tsx`).
2. On click: `window.location.href = parachord://queue/add?artist=…&title=…` (or use `recording_mbid` if present, per the Parachord protocol schema).
3. Toast `Sent to Parachord`.
4. Verify in preview (the protocol nav will fail without Parachord installed; toast still fires).
5. `git commit -m "feat(track-actions): Add to Parachord queue"`

### Task 26: Delete listen + shared `<ConfirmDialog />`

**Files (create):** `components/achordion/track-actions/confirm-dialog.tsx`

**Steps:**
1. Generic AlertDialog wrapper: `{ open, title, body, confirmLabel, onConfirm, destructive? }`.
2. Menu item shown only when `track.listenedAt && track.ownerUsername === viewer.mbUsername`.
3. On confirm: `deleteListenAction`, optimistically remove the row from the live-scrobble-list state (the list will need a `onListenRemoved(msid, listenedAt)` callback prop).
4. Toast on success / restore + toast on failure.
5. Verify in preview by deleting a listen on `/me/listens`.
6. `git commit -m "feat(track-actions): Delete listen + confirm dialog"`

### Task 27: Add to playlist submenu + `<NewPlaylistDialog />`

**Files (create):** `components/achordion/track-actions/new-playlist-dialog.tsx`

**Steps:**
1. Use `DropdownMenuSub` to render a submenu of `getUserPlaylistsForViewer` results (lazy-load on first sub-open via React Query).
2. Each playlist item: on click, `addToPlaylistAction`, optimistic checkmark + toast.
3. Bottom of submenu: separator, then "+ New playlist…" → opens `<NewPlaylistDialog>` (name + isPublic toggle). Submit → `createPlaylistAction({ recordingMbid })` → toast `Created "Name" · View`.
4. Disabled top-level when `!track.recordingMbid`.
5. Verify in preview.
6. `git commit -m "feat(track-actions): Add to playlist submenu + create-new dialog"`

### Task 28: Recommend submenu + `<RecommendDialog />`

**Files (create):** `components/achordion/track-actions/recommend-dialog.tsx`

**Steps:**
1. Submenu with two items: `All followers` (immediate fire) and `Choose people…` (opens dialog).
2. Dialog: searchable, scrollable list of followers (`getUserFollowers` lazy-loaded), checkboxes, recipient counter, max 50.
3. Submit → `recommendTrackAction({ recipients })`, toast `Recommended to N follower(s)`.
4. Disabled when `!track.recordingMbid`.
5. Verify in preview.
6. `git commit -m "feat(track-actions): Recommend submenu + picker dialog"`

### Task 29: Write a review (disabled)

**Steps:**
1. Disabled menu item with label `Write a review… (Coming soon)`.
2. Tooltip explaining CritiqueBrainz integration is forthcoming.
3. `git commit -m "feat(track-actions): coming-soon Write a Review item"`

---

## Phase 7 — No-token UX

### Task 30: `<NeedsTokenPopover />`

**Files (create):** `components/achordion/track-actions/needs-token-popover.tsx`

**Steps:**
1. Component wraps a menu item; if `!hasLbToken`, intercepts click to open a Popover anchored to the item.
2. Popover body: "Add your ListenBrainz token to do this." + Link button to `/settings/connections`.
3. Thread `hasLbToken: boolean` from the server-side parent of `<TrackActionsMenu>` (compute via `hasUserLbToken()` from `lib/lb-token.ts`).
4. Apply to every token-gated menu item.
5. Verify in preview by signing in *without* a token, clicking Love → confirm popover appears.
6. `git commit -m "feat(track-actions): NeedsTokenPopover for token-gated items"`

---

## Phase 8 — Surface integration

### Task 31: Playlist track rows

**Files (modify):** Find the playlist track row component (likely in `app/(app)/playlist/[mbid]/` or `components/achordion/`) and add the menu.

**Steps:**
1. Locate the file with `rg -l "playlist.*track" components app`.
2. Drop `<TrackActionsMenu>` per row with the appropriate `TrackRef` (no `listenedAt`/`ownerUsername`).
3. Verify in preview on a playlist page.
4. `git commit -m "feat(track-actions): integrate menu into playlist tracks"`

### Task 32: Entity tracklists (artist top-tracks, album tracklist, recording-page siblings)

**Steps:**
1. Locate the three components via `rg`.
2. Drop the menu per row in each.
3. Verify in preview on `/artist/<mbid>`, `/release-group/<mbid>`, `/recording/<mbid>`.
4. `git commit -m "feat(track-actions): integrate menu into entity tracklists"`

---

## Phase 9 — Final verification

### Task 33: Lint + typecheck

**Steps:**
1. `pnpm lint`
2. `pnpm tsc --noEmit`
3. Fix anything that turns up.
4. `git commit -m "chore: lint + typecheck cleanup"` if anything changes.

### Task 34: End-to-end preview verification

**Steps:**
1. With dev server running, navigate to `/` (live scrobble list), `/playlist/<mbid>`, `/artist/<mbid>`, `/release-group/<mbid>`, `/recording/<mbid>`.
2. For each surface: open the menu, fire each item (or open its dialog), confirm toasts.
3. `preview_console_logs --level error` and `preview_network --filter failed` after each surface — should be empty.
4. `preview_screenshot` of one surface to share as proof.

### Task 35: Open the PR

**Steps:**
1. `git push -u origin feature/track-actions-menu`
2. `gh pr create` per the standard format. Title under 70 chars, body summarizes Love / Pin / Recommend / Add-to-playlist / Queue / Delete and links the design doc.
3. Return the PR URL.

---

## Out of scope (do NOT do in this PR)

- CritiqueBrainz OAuth + review composer
- `score: -1` (hate)
- Bulk multi-select operations
- Search-results placement
- Telemetry
- Adding a test framework
