# Achordion track-links lookup API

*A public, read-only lookup into Achordion's MBID → streaming-URL database, offered to MusicBrainz / MetaBrainz and any other consumer building on MBIDs.*

## What this is

[Achordion](https://achordion.xyz) maintains a community-curated mapping from **MusicBrainz recording and release-group MBIDs to the streaming-service URLs where that music is actually playable** (Spotify, Apple Music, Bandcamp, Tidal, Deezer, Qobuz, YouTube Music, …). It exists to fill the gap between MusicBrainz's identity layer and the "where can I play this right now?" question — see the framing on [achordion.xyz/about](https://achordion.xyz/about).

The dataset's distinguishing feature is its highest-trust source: **playback-confirmed matches**. When a listener plays a recording through a streaming service in [Parachord](https://parachord.com) and audio comes out, that play validates the recording's identity — a human confirmed "this MBID *is* this song," no editing step required.

Crucially, on that confirmation Parachord submits **every high-confidence cross-service match it has resolved for the recording — not just the single URL the listener happened to stream.** Parachord resolves a track across services (Spotify, Apple Music, Tidal, Bandcamp, …) and holds the ones it's confident about; when a play confirms the identity, the whole confident set is contributed at `parachord` trust. So a `parachord`-sourced entry is typically **multi-service**, and each of those links is playback-grade, not just the one that was streamed. This is what lets coverage scale past hand-edited URL relationships — one confirmed play seeds a fully-linked recording.

We'd like MusicBrainz to be able to use this data — most obviously as candidate URL relationships for editors/bots, or as a companion lookup for anything MBID-keyed.

## Endpoint

```
GET https://achordion.xyz/api/track-links/lookup
```

No authentication. Pass **exactly one** of:

| Param | Meaning |
|---|---|
| `mbid` | 36-char MBID. Combine with `entity=recording` (default; alias `track`) or `entity=release-group` (alias `album`). |
| `isrc` | An ISRC (e.g. `GBAYE0601498`). Recording lookups only. Useful because the same audio is often modelled as multiple recording MBIDs; ISRC-keyed entries bridge them. |

### Calls & responses

All examples below are the **actual verified output** of the endpoint.

**1. Recording by MBID (hit)**

```
$ curl 'https://achordion.xyz/api/track-links/lookup?mbid=<recording-mbid>'
```
```json
{
  "entity": "recording",
  "mbid": "<recording-mbid>",
  "track_name": "Example Song",
  "artist_name": "Example Artist",
  "album_name": "Example Album",
  "isrcs": ["US1234567890"],
  "resolved_at": 1783100000,
  "links": [
    { "url": "https://open.spotify.com/track/…",              "label": "Spotify",     "host": "spotify.com",             "source": "parachord" },
    { "url": "https://music.apple.com/us/song/…",             "label": "Apple Music", "host": "music.apple.com",         "source": "odesli" },
    { "url": "https://exampleartist.bandcamp.com/track/…",    "label": "Bandcamp",    "host": "exampleartist.bandcamp.com", "source": "mb" }
  ]
}
```

**2. Release-group (album) by MBID** — same body shape, with `"entity": "release-group"`:

```
$ curl 'https://achordion.xyz/api/track-links/lookup?mbid=<release-group-mbid>&entity=release-group'
```

**3. Recording by ISRC (alias hit)** — identical body, except the key echoed back is `isrc` instead of `mbid` (`isrcs` may list additional ISRCs the same audio is filed under):

```
$ curl 'https://achordion.xyz/api/track-links/lookup?isrc=US1234567890'
```
```json
{
  "entity": "recording",
  "isrc": "US1234567890",
  "track_name": "Example Song",
  "artist_name": "Example Artist",
  "album_name": "Example Album",
  "isrcs": ["US1234567890"],
  "resolved_at": 1783100000,
  "links": [ … ]
}
```

**4. Miss** — `404` (see *Freshness* below; this does **not** mean the recording isn't on streaming):

```
$ curl -i 'https://achordion.xyz/api/track-links/lookup?mbid=<unknown-mbid>'
HTTP/2 404
Cache-Control: public, s-maxage=300
{"error":"no entry"}
```

**5. Errors** — all `400` with a message:

| Request | Response body |
|---|---|
| both `mbid` and `isrc`, or neither | `{"error":"pass exactly one of mbid or isrc"}` |
| `mbid` not a 36-char UUID | `{"error":"malformed mbid"}` |
| `isrc` not `^[A-Z]{2}[A-Z0-9]{3}\d{7}$` | `{"error":"malformed isrc"}` |
| `isrc` with `entity=release-group` | `{"error":"isrc lookups are recording-only"}` |
| unknown `entity` value | `{"error":"entity must be recording\|track\|release-group\|album"}` |

Rate-limited requests return `429` with a `Retry-After` header.

### Field notes

- `track_name` / `artist_name` / `album_name` are point-in-time snapshots captured at resolve time (MB editors may have renamed since) and may be `null` on older entries. The MBID is the identity; treat names as debugging aids.
- `isrcs` is the set of ISRCs the entry is filed under (recordings only; `[]` for albums / when none captured).
- `resolved_at` is Unix seconds of the last write to the entry (`null` on very old entries).
- `links[].source` is the provenance tag — see the next section. `label` is a display name; `host` is the canonicalised hostname.
- Responses are CDN-cached: `s-maxage=3600, stale-while-revalidate=86400` on hits, `s-maxage=300` on misses.

## Provenance — the `source` field

Every link is tagged with where it came from. **This is the field that matters for any MusicBrainz import decision:**

| `source` | Meaning | Import guidance |
|---|---|---|
| `parachord` | **Playback-confirmed.** A listener played this recording in Parachord and audio came out, confirming the MBID's identity — and Parachord contributed *all* its high-confidence service matches for that recording (see intro), not only the streamed URL. Implicit human curation. | The interesting subset. Suitable as candidate URL-rels (subject to your own review norms). |
| `odesli` | Resolved via the Odesli/song.link cross-service API. Algorithmic best-effort match. | Treat as unverified hints. |
| `mb` | Mirrored **from MusicBrainz's own URL relationships**. | **Never re-import** — it's your data reflected back (circular). |
| `parachord-scrobble` | The `origin_url` a scrobble passively reported. Real URL, but the MBID attribution came from ListenBrainz's mapper and may be a sibling recording. | Lowest trust; hint only. |

## Freshness & coverage semantics

This is a **living cache, not an archive**:

- Entries carry a rolling **90-day TTL**, refreshed on activity (plays, re-resolution, submissions). A quiet track's entry can expire; it re-materialises the next time anything resolves it.
- Therefore **a 404 means "no entry right now", not "not available on streaming."** Absence is not a negative claim.
- Coverage is driven by what people actually play and look at. It skews toward actively-listened music and grows continuously.
- Links are deduplicated per streaming host, with higher-trust sources overriding lower on conflicts (`parachord` > `odesli` > `mb` > `parachord-scrobble`).

## Rate limits & reciprocity

We rate-limit this endpoint at **~1 request/second per IP — deliberately the same ceiling MusicBrainz applies to its own API.** The symmetry is intentional: Achordion consumes the MusicBrainz web service at your 1 req/sec limit, and we limit you to the same rate in return. Neither side is advantaged.

**We'd rather raise both together than either alone.** If a higher throughput is mutually useful — you pulling from us faster, us pulling from you faster — we'd happily agree a **symmetric increase**: you lift Achordion's rate against the MusicBrainz API, we lift yours against this endpoint by the same factor. A reciprocal bump costs neither party anything it isn't already extending to the other.

Please set a descriptive `User-Agent` with contact info (the courtesy MusicBrainz asks of its own consumers), and expect `429` with `Retry-After` when over budget. Responses are CDN-cached, so re-fetching hot MBIDs is effectively free and doesn't count against the limit.

## Bulk access

Enumerating the whole corpus MBID-by-MBID is the wrong tool regardless of rate limit. If MetaBrainz wants **bulk access — a periodic JSON dump or a replication-style feed — ask; we're happy to build it.** That's the right shape for ingesting the corpus at scale (and it sidesteps the per-request path entirely on both sides). The per-MBID endpoint ships first because it's the smallest useful surface.

## License

The mapping data (MBID → URL pairings and their provenance tags) is offered under **CC0 1.0** so it can be ingested into MusicBrainz without licensing friction. (Names/ISRCs echoed in responses originate from MusicBrainz/ListenBrainz data and remain under their existing terms.)

## Write side (for context)

The database is populated by: Parachord clients POSTing playback-confirmed matches (bearer-authed), Achordion's own resolution (MusicBrainz URL-rels + Odesli), and passive scrobble source-URL capture. The write API isn't part of this offer, but if MetaBrainz ever wants a trusted write channel (e.g. bot-verified matches flowing back), that's an easy conversation.

## Contact

J Herskowitz — jherskow@gmail.com · [github.com/jherskowitz/achordion](https://github.com/jherskowitz/achordion) (the store/resolver implementation is `lib/track-links-store.ts` / `lib/track-links-resolver.ts`; this endpoint is `app/api/track-links/lookup/route.ts`).
