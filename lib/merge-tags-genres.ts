/**
 * Merge MusicBrainz `genres` and `tags` into a single deduped list.
 *
 * Background: MB stores two related-but-distinct lists per entity.
 *   - `genres` is the curated genre vocabulary (a subset of tags MB
 *      has accepted as official "genres" like rock, jazz, ambient).
 *   - `tags` is the open user-submitted-label list — any string a
 *      user has voted on, including freeform additions like "live"
 *      or "stoner-doom".
 *
 * Entity pages used to prefer genres over tags entirely (`genres ?
 * genres : tags`), which meant any user-added tag on a recording /
 * release-group / artist with even one curated genre disappeared
 * from the chip row. The user's vote went through to MB just fine,
 * but their tag never re-appeared in the UI because the read path
 * filtered it out.
 *
 * Union semantics:
 *   - Dedupe by lower-cased name.
 *   - When the same name exists in both lists, prefer the entry
 *     with the higher count (usually genres, since they're more
 *     widely voted).
 *   - Sort descending by count.
 *   - Drop entries with count <= 0 — same filter the entity pages
 *     applied before.
 */

export interface TagOrGenreEntry {
  name: string;
  count: number;
}

export function mergeTagsAndGenres(
  tags: ReadonlyArray<TagOrGenreEntry> | undefined,
  genres: ReadonlyArray<TagOrGenreEntry> | undefined,
  limit = 8,
): TagOrGenreEntry[] {
  const byName = new Map<string, TagOrGenreEntry>();
  const ingest = (list: ReadonlyArray<TagOrGenreEntry> | undefined) => {
    if (!list) return;
    for (const e of list) {
      if (!e.name || e.count <= 0) continue;
      const key = e.name.toLowerCase();
      const prev = byName.get(key);
      if (!prev || e.count > prev.count) {
        byName.set(key, { name: e.name, count: e.count });
      }
    }
  };
  // Order: tags first (so a curated-but-not-yet-counted genre with
  // the same name overwrites with its higher count), then genres.
  ingest(tags);
  ingest(genres);
  return Array.from(byName.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
