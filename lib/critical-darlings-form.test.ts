// Run with: npm run test:unit   (node --test, native TypeScript)
import test from "node:test";
import assert from "node:assert/strict";
import { parseIftttForm } from "./critical-darlings-form.ts";

test("preserves an unencoded & inside a value (the R&B truncation bug)", () => {
  const raw =
    "title=New Avatar by Kelela&summary=A shimmering, ethereal R&B record.&spotifyUrl=https://open.spotify.com/album/xyz";
  const parsed = parseIftttForm(raw);
  assert.equal(parsed.title, "New Avatar by Kelela");
  assert.equal(parsed.summary, "A shimmering, ethereal R&B record.");
  assert.equal(parsed.spotifyUrl, "https://open.spotify.com/album/xyz");
});

test("preserves & in the title/artist (Panda Bear & Sonic Boom)", () => {
  const raw =
    "title=A Of WHEN by Panda Bear & Sonic Boom&reviewUrl=https://www.metacritic.com/music/x";
  const parsed = parseIftttForm(raw);
  assert.equal(parsed.title, "A Of WHEN by Panda Bear & Sonic Boom");
  assert.equal(parsed.reviewUrl, "https://www.metacritic.com/music/x");
});

test("handles multiple & in one value", () => {
  const raw = "title=T&summary=jazz & funk & soul&pubDate=2026-07-10";
  const parsed = parseIftttForm(raw);
  assert.equal(parsed.summary, "jazz & funk & soul");
  assert.equal(parsed.pubDate, "2026-07-10");
});

test("still decodes a properly percent-encoded value", () => {
  const raw = "title=R%26B%20Gold&summary=100%25%20essential";
  const parsed = parseIftttForm(raw);
  assert.equal(parsed.title, "R&B Gold");
  assert.equal(parsed.summary, "100% essential");
});

test("falls back to raw when decode would throw (bare % in raw text)", () => {
  const raw = "title=T&summary=50% off & counting";
  const parsed = parseIftttForm(raw);
  assert.equal(parsed.summary, "50% off & counting");
});

test("ignores unknown keys, keeps known ones", () => {
  const raw = "foo=bar&title=Real Title&score=88";
  const parsed = parseIftttForm(raw);
  assert.equal(parsed.title, "Real Title");
  assert.equal(parsed.score, "88");
  assert.ok(!("foo" in parsed));
});

test("empty body yields an empty object", () => {
  assert.deepEqual(parseIftttForm(""), {});
});
