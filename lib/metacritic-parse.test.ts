// Run with: npm run test:unit   (node --test, native TypeScript)
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseMetacriticNewReleases,
  highScoringAlbums,
} from "./metacritic-parse.ts";

// Synthetic fixture mirroring the real row markup (2026-07): a high
// scorer with entities, a low scorer, and a "tbd" score.
const FIXTURE = `
<div class="clamp-score-wrap"><a class="metascore_anchor" href="/music/album-one/artist-a/critic-reviews"><div class="metascore_w large release positive">85</div></a></div><a href="/music/album-one/artist-a" class="title"><h3>Album &amp; One</h3></a><div class="clamp-details"><div class="artist"> by Artist A &amp; Friends </div><span>July 24, 2026</span></div><div class="summary"> Jazz &amp; soul with R&amp;B flair; it&#039;s great. </div>
<div class="clamp-score-wrap"><a class="metascore_anchor" href="/music/album-two/artist-b/critic-reviews"><div class="metascore_w large release mixed">67</div></a></div><a href="/music/album-two/artist-b" class="title"><h3>Album Two</h3></a><div class="clamp-details"><div class="artist"> by Artist B </div><span>July 22, 2026</span></div><div class="summary"> A quieter record. </div>
<div class="clamp-score-wrap"><a class="metascore_anchor" href="/music/album-three/artist-c/critic-reviews"><div class="metascore_w large release tbd">tbd</div></a></div><a href="/music/album-three/artist-c" class="title"><h3>Album Three</h3></a><div class="clamp-details"><div class="artist"> by Artist C </div><span>July 20, 2026</span></div><div class="summary"> Not yet reviewed. </div>
`;

test("parses every row with all fields", () => {
  const albums = parseMetacriticNewReleases(FIXTURE);
  assert.equal(albums.length, 3);
  const a = albums[0];
  assert.equal(a.title, "Album & One");
  assert.equal(a.artist, "Artist A & Friends");
  assert.equal(a.score, 85);
  assert.equal(a.releaseDate, "July 24, 2026");
  assert.equal(a.reviewUrl, "https://www.metacritic.com/music/album-one/artist-a/critic-reviews");
  assert.equal(a.albumUrl, "https://www.metacritic.com/music/album-one/artist-a");
  assert.equal(a.summary, "Jazz & soul with R&B flair; it's great.");
});

test("decodes entities in title/artist/summary (incl. R&amp;B)", () => {
  const [a] = parseMetacriticNewReleases(FIXTURE);
  assert.ok(!a.summary!.includes("&amp;"));
  assert.ok(a.summary!.includes("R&B"));
});

test("tbd score becomes null", () => {
  const albums = parseMetacriticNewReleases(FIXTURE);
  const three = albums.find((x) => x.title === "Album Three");
  assert.equal(three?.score, null);
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
