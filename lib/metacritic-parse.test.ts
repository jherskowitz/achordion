// Run with: npm run test:unit   (node --test, native TypeScript)
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseMetacriticNewReleases,
  highScoringAlbums,
} from "./metacritic-parse.ts";

// Synthetic fixture mirroring Metacritic's redesigned music-browse card
// markup (2026-11): the stable bits the parser keys on — the
// /music/<album>/<artist>/ anchor, the Metascore aria-label, the <h3>
// title, and data-testid="product-artists" — wrapped in representative
// (volatile) Tailwind-class noise. Covers: a high scorer with entities and
// a NaN day, a mid scorer with a real day, and a "tbd" (unscored) album.
const FIXTURE = `
<a class="grid grid-cols-[5.5rem_auto] gap-x-1" href="/music/album-one/artist-a/" rel="follow" target="_self">
  <div class="score"><div title="Metascore 85 out of 100" aria-label="Metascore 85 out of 100"><span>85</span></div></div>
  <div><h3 class="truncate"><!----><span>Album &amp; One</span></h3>
  <div data-testid="product-artists" title="Artist A &amp; Friends">Artist A &amp; Friends</div>
  <div class="line-clamp-2 text-sm">ignored blurb</div>
  <div><span>Oct NaN, 2026</span></div></div>
</a>
<a class="grid grid-cols-[5.5rem_auto] gap-x-1" href="/music/album-two/artist-b/" rel="follow" target="_self">
  <div class="score"><div aria-label="Metascore 67 out of 100"><span>67</span></div></div>
  <div><h3 class="truncate"><span>Album Two</span></h3>
  <div data-testid="product-artists" title="Artist B">Artist B</div>
  <div><span>Sep 12, 2026</span></div></div>
</a>
<a class="grid grid-cols-[5.5rem_auto] gap-x-1" href="/music/album-three/artist-c/" rel="follow" target="_self">
  <div class="score"><div aria-label="Metascore tbd out of 100"><span>tbd</span></div></div>
  <div><h3 class="truncate"><span>Album Three</span></h3>
  <div data-testid="product-artists" title="Artist C">Artist C</div>
  <div><span>Aug NaN, 2026</span></div></div>
</a>
<a href="/music/some-nav-link/">a non-card /music anchor with no product card — must be ignored</a>
`;

test("parses every product card with all fields", () => {
  const albums = parseMetacriticNewReleases(FIXTURE);
  assert.equal(albums.length, 3);
  const a = albums[0];
  assert.equal(a.title, "Album & One");
  assert.equal(a.artist, "Artist A & Friends");
  assert.equal(a.score, 85);
  // Metacritic's SSR day is "NaN" → month + year only.
  assert.equal(a.releaseDate, "Oct 2026");
  assert.equal(a.albumUrl, "https://www.metacritic.com/music/album-one/artist-a/");
  // Link via the album page; no separate review URL, no Metacritic blurb.
  assert.equal(a.reviewUrl, null);
  assert.equal(a.summary, null);
});

test("keeps the real day when Metacritic renders one", () => {
  const two = parseMetacriticNewReleases(FIXTURE).find(
    (x) => x.title === "Album Two",
  );
  assert.equal(two?.releaseDate, "Sep 12, 2026");
});

test("decodes entities in title and artist", () => {
  const [a] = parseMetacriticNewReleases(FIXTURE);
  assert.ok(!a.title.includes("&amp;"));
  assert.ok(!a.artist!.includes("&amp;"));
  assert.equal(a.artist, "Artist A & Friends");
});

test("tbd score becomes null", () => {
  const three = parseMetacriticNewReleases(FIXTURE).find(
    (x) => x.title === "Album Three",
  );
  assert.equal(three?.score, null);
});

test("ignores non-card /music anchors", () => {
  const albums = parseMetacriticNewReleases(FIXTURE);
  assert.ok(!albums.some((a) => a.albumUrl.includes("some-nav-link")));
});

test("highScoringAlbums keeps only score > min", () => {
  const hi = highScoringAlbums(parseMetacriticNewReleases(FIXTURE), 80);
  assert.equal(hi.length, 1);
  assert.equal(hi[0].title, "Album & One");
});

test("empty / junk html yields no albums", () => {
  assert.deepEqual(parseMetacriticNewReleases(""), []);
  assert.deepEqual(parseMetacriticNewReleases("<div>nope</div>"), []);
});
