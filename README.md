# Achordion

A modern, open-source alternative front-end for [ListenBrainz](https://listenbrainz.org). Sister project to [Parachord](https://github.com/jherskow/parachord).

> Status: Phase 0 — clickable shell.

## What it is

Achordion mirrors every functional page that listenbrainz.org offers today, but with a fresh visual language and a cleaner information architecture. Sign in with MusicBrainz (the same identity ListenBrainz itself uses), then browse your listens, stats, charts, recommendations, and the full LB explore surface.

## Stack

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS v4 + shadcn/ui
- Auth.js v5 with a custom MusicBrainz OAuth2 provider
- TanStack Query for client-side server state
- Zod for runtime validation of external API responses

## Getting started

```bash
git clone https://github.com/jherskow/achordion.git
cd achordion
npm install
cp .env.example .env.local
# Fill in AUTH_SECRET, AUTH_MUSICBRAINZ_ID, AUTH_MUSICBRAINZ_SECRET
npm run dev
```

Open http://localhost:3000.

### MusicBrainz OAuth setup

To enable sign-in, register an OAuth application at
https://musicbrainz.org/account/applications with redirect URI
`http://localhost:3000/api/auth/callback/musicbrainz` for local dev. Paste the
generated client ID and secret into `.env.local`.

Generate `AUTH_SECRET` with:

```bash
npx auth secret
```

## Roadmap

See [`docs/plans/2026-05-01-achordion-design.md`](docs/plans/2026-05-01-achordion-design.md) for the full design.

- **Phase 0** — clickable shell, landing, login, layout (you are here)
- **Phase 1** — full route skeleton matching every LB page
- **Phase 2** — live data on `/`, `/search`, `/user/[name]`, `/artist/[mbid]`
- **Phase 3** — public release

## License

TBD.
