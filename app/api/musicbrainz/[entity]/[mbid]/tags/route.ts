import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { decode } from "next-auth/jwt";
import {
  submitTagVote,
  TagApiError,
  TagAuthError,
  type TagEntity,
  type TagVote,
} from "@/lib/clients/musicbrainz-tags";
import { isTaggingBlocked } from "@/lib/tag-blocklist";

/**
 * Per-user tag-state + vote endpoint, scoped to one MB entity.
 *
 * GET → return the calling user's tag votes on this entity. Requires
 *       sign-in but NOT the broader `tag` OAuth scope; the read
 *       endpoint accepts any valid MB token. Response shape:
 *         { votes: { [tagName]: 'upvote' | 'downvote' } }
 *       Returns `{ votes: {} }` for sessions that don't have an
 *       MB token at all (still signed in via legacy session).
 *
 * POST  → submit a vote. Body `{ tag: string, vote: 'upvote'|
 *         'downvote'|'withdraw' }`. Returns the updated `votes` map
 *         (same shape as GET) on success so the client can sync.
 *         On scope/auth gaps returns 401 with `{ reason: ... }`
 *         so the client can route to the right re-auth flow.
 *
 * Scoped under /api/musicbrainz/[entity]/[mbid]/tags so future
 * MB-side endpoints (collections, ratings) can drop in alongside.
 */

export const dynamic = "force-dynamic";

const ALLOWED_ENTITIES = new Set<TagEntity>([
  "artist",
  "release-group",
  "recording",
  "release",
]);

const VoteRequestSchema = z.object({
  tag: z.string().min(1).max(80),
  vote: z.enum(["upvote", "downvote", "withdraw"]),
});

const NO_STORE: Record<string, string> = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
};

const MB_BASE = "https://musicbrainz.org/ws/2";
const USER_AGENT = "Achordion/0.1 (jherskow@gmail.com)";

const UserTagsResponseSchema = z
  .object({
    "user-tags": z
      .array(
        z.object({
          name: z.string(),
          // `count` is `1` for upvotes, `-1` for downvotes, sometimes
          // missing on responses where MB only emits the name.
          count: z.number().nullish(),
        }),
      )
      .optional(),
  })
  .passthrough();

function parseEntity(value: string): TagEntity | null {
  return ALLOWED_ENTITIES.has(value as TagEntity)
    ? (value as TagEntity)
    : null;
}

/**
 * Decode the Auth.js v5 session JWT directly out of the request
 * cookie. We can't use `getToken()` from `next-auth/jwt` here — in
 * v5 beta its cookie-name / salt defaults don't match what Auth.js's
 * encoder writes, so it returns null even when the cookie is valid
 * and `auth()` decodes it just fine. Calling `decode()` ourselves
 * with explicit cookie name + salt sidesteps the mismatch.
 *
 * Cookie naming follows Auth.js v5: `__Secure-` prefix in HTTPS,
 * `authjs.` (not `next-auth.`) infix. Salt defaults to the cookie
 * name on Auth.js's encode side, so we mirror that here.
 */
async function readJwtMbAuth(
  request: NextRequest,
): Promise<{ accessToken: string | null; scope: string }> {
  const secureCookie =
    request.url.startsWith("https://") ||
    request.headers.get("x-forwarded-proto") === "https";
  const cookieName = secureCookie
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
  const cookie = request.cookies.get(cookieName)?.value;
  if (!cookie) return { accessToken: null, scope: "" };
  const secret = process.env.AUTH_SECRET;
  if (!secret) return { accessToken: null, scope: "" };
  try {
    const token = await decode({
      token: cookie,
      secret,
      salt: cookieName,
    });
    return {
      accessToken:
        typeof token?.mbAccessToken === "string" ? token.mbAccessToken : null,
      scope: typeof token?.mbScope === "string" ? token.mbScope : "",
    };
  } catch {
    return { accessToken: null, scope: "" };
  }
}


/**
 * Authenticated MB GET to fetch the calling user's tag votes for
 * one entity. Bypasses our cached `mbFetch` because the response is
 * per-user and never shareable.
 */
async function fetchUserVotes(
  entity: TagEntity,
  mbid: string,
  accessToken: string,
): Promise<Record<string, "upvote" | "downvote">> {
  const url = `${MB_BASE}/${entity}/${encodeURIComponent(mbid)}?inc=user-tags&fmt=json`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });
  if (!res.ok) return {};
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return {};
  }
  const parsed = UserTagsResponseSchema.safeParse(json);
  if (!parsed.success) return {};
  const votes: Record<string, "upvote" | "downvote"> = {};
  for (const t of parsed.data["user-tags"] ?? []) {
    if (t.count === 1) votes[t.name] = "upvote";
    else if (t.count === -1) votes[t.name] = "downvote";
  }
  return votes;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string; mbid: string }> },
): Promise<NextResponse> {
  const { entity: entityRaw, mbid } = await params;
  const entity = parseEntity(entityRaw);
  if (!entity) {
    return NextResponse.json({ error: "invalid entity" }, { status: 400 });
  }
  const session = await auth();
  if (!session?.user?.mbUsername) {
    return NextResponse.json(
      { votes: {}, blocked: false },
      { headers: NO_STORE },
    );
  }
  // Surface the blocklist state to the client so it can hide the
  // vote / add-tag affordances entirely instead of rendering them
  // and then 403'ing on click. Existing votes still come back so
  // chips that the user previously voted on stay rendered as plain
  // names (no controls).
  const blocked = await isTaggingBlocked(session.user.mbUsername);
  const { accessToken } = await readJwtMbAuth(request);
  if (!accessToken) {
    return NextResponse.json(
      { votes: {}, blocked },
      { headers: NO_STORE },
    );
  }
  const votes = await fetchUserVotes(entity, mbid, accessToken).catch(
    () => ({}) as Record<string, "upvote" | "downvote">,
  );
  return NextResponse.json({ votes, blocked }, { headers: NO_STORE });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string; mbid: string }> },
): Promise<NextResponse> {
  const { entity: entityRaw, mbid } = await params;
  const entity = parseEntity(entityRaw);
  if (!entity) {
    return NextResponse.json({ error: "invalid entity" }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const parsed = VoteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid vote payload" },
      { status: 400 },
    );
  }
  const { tag, vote } = parsed.data as { tag: string; vote: TagVote };

  // Auth gating: only check that we have a session + access token.
  // We deliberately DON'T pre-flight the `tag` scope here because
  // MB's token endpoint doesn't echo back granted scopes in its
  // JSON response, so we'd false-negative every signed-in user
  // whose JWT lacks the (uncapturable) field. If the token actually
  // lacks the scope, MB itself returns 401 from /ws/2/tag and we
  // surface that as a re-auth prompt below.
  const session = await auth();
  if (!session?.user?.mbUsername) {
    return NextResponse.json(
      { error: "not signed in", reason: "unauthenticated" },
      { status: 401, headers: NO_STORE },
    );
  }
  // Soft-block bad actors at the API boundary — keeps tagging open
  // by default but lets us cut off spammy users without breaking
  // sign-in or hiding existing chips. Returns 403 with a deliberately
  // vague message so the blocked user can't probe for the exact
  // reason they were cut off.
  if (await isTaggingBlocked(session.user.mbUsername)) {
    return NextResponse.json(
      { error: "tag voting is unavailable for this account" },
      { status: 403, headers: NO_STORE },
    );
  }
  const { accessToken, scope } = await readJwtMbAuth(request);
  if (!accessToken) {
    return NextResponse.json(
      { error: "no MB access token", reason: "scope_required" },
      { status: 401, headers: NO_STORE },
    );
  }

  // Temporary diagnostic: which scope does the JWT think it has on
  // this request? MB's token endpoint doesn't echo back granted scope,
  // so we fall back to the requested string ("profile tag"). If users
  // see scope_required errors here while the JWT claims "profile tag",
  // it means MB issued a token that doesn't carry the tag privilege —
  // an app-registration / consent-screen problem, not a client bug.
  console.log(
    `[mb-tag-vote] user=${session.user.mbUsername} jwt-scope="${scope}" entity=${entity} vote=${vote}`,
  );

  try {
    await submitTagVote({ entity, mbid, tag, vote, accessToken });
  } catch (err) {
    if (err instanceof TagAuthError) {
      return NextResponse.json(
        { error: err.message, reason: err.reason },
        { status: 401, headers: NO_STORE },
      );
    }
    if (err instanceof TagApiError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.status, headers: NO_STORE },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown error" },
      { status: 500, headers: NO_STORE },
    );
  }

  // Fetch fresh vote map so the client doesn't have to second-guess
  // the optimistic update. MB usually reflects the new state on the
  // next read; if it lags, the client will see the stale value and
  // repaint on the next periodic refetch.
  const votes = await fetchUserVotes(entity, mbid, accessToken).catch(
    () => ({}) as Record<string, "upvote" | "downvote">,
  );
  return NextResponse.json({ votes }, { headers: NO_STORE });
}
