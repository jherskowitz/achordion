import "server-only";

import { auth } from "@/auth";

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

/** Granted by MB OAuth when the user's session includes tag voting. */
const TAG_SCOPE = "tag";

export class TagAuthError extends Error {
  /** Tells the client whether to prompt sign-in (`unauthenticated`) or
   *  prompt re-auth with the broader scope (`scope_required`). */
  constructor(
    message: string,
    public readonly reason: "unauthenticated" | "scope_required",
  ) {
    super(message);
    this.name = "TagAuthError";
  }
}

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
 * Resolve the current viewer's MB OAuth context. Throws `TagAuthError`
 * when the session is missing entirely, or when it's signed in but
 * lacks the `tag` scope (legacy session before scope was widened).
 */
async function requireMbTagAuth(): Promise<{ accessToken: string }> {
  const session = await auth();
  if (!session?.user?.mbUsername) {
    throw new TagAuthError("not signed in", "unauthenticated");
  }
  // The access token lives only on the JWT — fetch it via the same
  // path Next.js uses internally. We can't read it from `session`
  // because we deliberately don't expose it in the Session shape.
  // Instead, we rely on the JWT being available through Auth.js's
  // server-side helpers via the request cookies. Here we use a
  // workaround: route handlers + server actions call `auth()` which
  // returns the session; the access token is attached to the JWT
  // separately. Use `getToken` to retrieve it directly.
  const { getToken } = await import("next-auth/jwt");
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  // Auth.js v5 JWT lookup: pass a faux Request-like object containing
  // the cookies. The `secret` is auto-resolved from AUTH_SECRET.
  const fakeReq = {
    cookies: Object.fromEntries(
      cookieStore.getAll().map((c) => [c.name, c.value]),
    ),
    headers: { cookie: cookieStore.toString() },
  } as unknown as Request;
  const jwt = await getToken({
    req: fakeReq,
    secret: process.env.AUTH_SECRET,
  });
  const accessToken =
    typeof jwt?.mbAccessToken === "string" ? jwt.mbAccessToken : null;
  const scope = typeof jwt?.mbScope === "string" ? jwt.mbScope : "";
  if (!accessToken) {
    throw new TagAuthError("no MB access token on session", "scope_required");
  }
  if (!scope.split(/\s+/).includes(TAG_SCOPE)) {
    throw new TagAuthError(
      "MB session is missing the `tag` scope",
      "scope_required",
    );
  }
  return { accessToken };
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

/**
 * Submit a vote on a single tag for a single entity. Returns void on
 * success; throws `TagAuthError` on auth gaps and `TagApiError` for
 * any other non-2xx response.
 */
export async function submitTagVote(opts: {
  entity: TagEntity;
  mbid: string;
  tag: string;
  vote: TagVote;
}): Promise<void> {
  const { entity, mbid, tag, vote } = opts;
  const { accessToken } = await requireMbTagAuth();

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
  const res = await fetch(url, {
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
