import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { getToken } from "next-auth/jwt";
import {
  submitTagVote,
  TagApiError,
  TagAuthError,
  type TagEntity,
  type TagVote,
} from "@/lib/clients/musicbrainz-tags";

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

async function readJwtAccessToken(
  request: NextRequest,
): Promise<string | null> {
  const jwt = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
  });
  return typeof jwt?.mbAccessToken === "string" ? jwt.mbAccessToken : null;
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
    return NextResponse.json({ votes: {} }, { headers: NO_STORE });
  }
  const accessToken = await readJwtAccessToken(request);
  if (!accessToken) {
    return NextResponse.json({ votes: {} }, { headers: NO_STORE });
  }
  const votes = await fetchUserVotes(entity, mbid, accessToken).catch(
    () => ({}) as Record<string, "upvote" | "downvote">,
  );
  return NextResponse.json({ votes }, { headers: NO_STORE });
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

  try {
    await submitTagVote({ entity, mbid, tag, vote });
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
  const accessToken = await readJwtAccessToken(request);
  const votes = accessToken
    ? await fetchUserVotes(entity, mbid, accessToken).catch(
        () => ({}) as Record<string, "upvote" | "downvote">,
      )
    : {};
  return NextResponse.json({ votes }, { headers: NO_STORE });
}
