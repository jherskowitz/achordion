import "server-only";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

/**
 * MusicBrainz user-tag voting client.
 *
 * Read-side tag access lives in `musicbrainz.ts` via `mbFetch` and is
 * unauthenticated. The vote-side requires a MB OAuth token with the
 * `tag` scope — split into this file because it has different auth +
 * caching characteristics:
 *   - Always per-user, never cacheable.
 *   - Always a write → never `next: { revalidate, tags }`.
 *   - Uses XML body, not query params.
 *
 * Auth is the caller's responsibility: pass `accessToken` resolved
 * from the JWT in the route handler (where the `NextRequest` is in
 * scope). This function is auth-agnostic and just talks to MB.
 *
 * MB's tag-vote endpoint is `POST /ws/2/tag?client=<id>` with an XML
 * body whose root element is `<metadata>` containing per-entity
 * `<{entity}-list>` blocks of `<{entity} id="..."><user-tag-list><user-tag vote="upvote|downvote|withdraw"><name>...</name></user-tag></user-tag-list></{entity}>`.
 *
 * See https://wiki.musicbrainz.org/MusicBrainz_API#Submitting_user_tags
 */

const MB_BASE = "https://musicbrainz.org/ws/2";
// MB requires `client=<short-id>` on every write. Their convention is
// `appname-version`. Keeps writes attributable in MB's audit logs.
const MB_CLIENT_ID = "achordion-0.1";
const USER_AGENT = "Achordion/0.1 (jherskow@gmail.com)";

export type TagEntity = "artist" | "release-group" | "recording" | "release";
export type TagVote = "upvote" | "downvote" | "withdraw";

export class TagApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "TagApiError";
  }
}

/**
 * Cheap escape helper. Tag names are user-supplied and travel inside
 * an XML element body; we MUST escape `<` `>` and `&`. The other XML
 * special characters (`'` `"`) only matter inside attributes.
 */
function escapeXml(s: string): string {
  return s.replace(/[<>&]/g, (ch) =>
    ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : "&amp;",
  );
}

export class TagAuthError extends Error {
  constructor(
    message: string,
    public readonly reason: "unauthenticated" | "scope_required",
  ) {
    super(message);
    this.name = "TagAuthError";
  }
}

/**
 * Submit a vote on a single tag for a single entity. The caller is
 * responsible for resolving the OAuth access token (typically via
 * `getToken({ req })` in an API route) and ensuring it carries the
 * `tag` scope. We only handle the MB API call.
 *
 * Returns void on success; throws `TagAuthError` if MB itself rejects
 * the bearer (401/403) and `TagApiError` for any other non-2xx.
 */
export async function submitTagVote(opts: {
  entity: TagEntity;
  mbid: string;
  tag: string;
  vote: TagVote;
  accessToken: string;
}): Promise<void> {
  const { entity, mbid, tag, vote, accessToken } = opts;

  // Build the per-entity XML envelope MB expects. MB is strict about
  // element capitalization and ordering, hence the literal template.
  const tagXml = escapeXml(tag.trim().toLowerCase());
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<metadata xmlns="http://musicbrainz.org/ns/mmd-2.0#">` +
    `<${entity}-list>` +
    `<${entity} id="${mbid}">` +
    `<user-tag-list>` +
    `<user-tag vote="${vote}"><name>${tagXml}</name></user-tag>` +
    `</user-tag-list>` +
    `</${entity}>` +
    `</${entity}-list>` +
    `</metadata>`;

  const url = `${MB_BASE}/tag?client=${encodeURIComponent(MB_CLIENT_ID)}`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/xml; charset=utf-8",
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/xml",
    },
    body: xml,
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403) {
    throw new TagAuthError(
      `MB rejected the tag vote (${res.status}); session likely expired or scope was revoked`,
      "scope_required",
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new TagApiError(
      `MB tag vote failed (${res.status}): ${body.slice(0, 200)}`,
      res.status,
    );
  }
}
