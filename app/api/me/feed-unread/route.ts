import { cookies } from "next/headers";
import { auth } from "@/auth";
import { getLbTokenForRequest } from "@/lib/lb-token";
import { getFollowing, getUserFeed } from "@/lib/clients/listenbrainz";
import { getBskyFriendLinkEvents } from "@/lib/bsky-friend-events";
import { getMentionEvents } from "@/lib/mention-events";
import { getListenAlongEvents } from "@/lib/listen-along-events";

const COOKIE = "feed_seen_ts";

export async function GET() {
  const session = await auth();
  const viewer = session?.user?.mbUsername;
  if (!viewer) {
    return Response.json({ count: 0, lastSeenTs: null }, { status: 200 });
  }
  const token = await getLbTokenForRequest();
  if (!token) {
    return Response.json({ count: 0, lastSeenTs: null }, { status: 200 });
  }

  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  const lastSeenTs = raw ? Number(raw) : null;
  // Unread = newer than lastSeen AND not authored by the viewer. New
  // viewers (no cookie yet) get a baseline of zero — we don't want
  // a brand-new sign-in to flash a "50 unread" badge.
  const cutoff = lastSeenTs ?? Math.floor(Date.now() / 1000);

  // Parallel-fetch every source: native LB feed + Achordion-side
  // synthetic events (bsky-friend-linked, @-mention, listen-along).
  // All fail-soft so any one outage doesn't suppress the others'
  // contribution to the count. `following` is needed by the listen-
  // along reader; fetch it once and share.
  const followingPromise = getFollowing(viewer).catch(() => [] as string[]);
  const [events, bskyFriendEvents, mentionEvents, listenAlongEvents] =
    await Promise.all([
      getUserFeed(viewer, token, { count: 50 }),
      getBskyFriendLinkEvents(viewer, cutoff).catch(() => []),
      getMentionEvents(viewer, cutoff).catch(() => []),
      followingPromise.then((following) =>
        getListenAlongEvents(viewer, following, cutoff).catch(() => []),
      ),
    ]);
  const syntheticCount =
    bskyFriendEvents.length + mentionEvents.length + listenAlongEvents.length;
  if (events === null) {
    // LB feed unreachable — fall back to the synthetic-side count so
    // the badge still reflects new friend-link / mention / listen-
    // along events.
    return Response.json(
      { count: syntheticCount, lastSeenTs },
      { status: 200 },
    );
  }

  let count = syntheticCount;
  for (const e of events) {
    if ((e.user_name ?? "") === viewer) continue;
    if (e.created > cutoff) count++;
  }
  return Response.json(
    { count, lastSeenTs },
    {
      status: 200,
      headers: {
        // Short cache so polling from a focused tab stays cheap but
        // a fresh visit picks up new pins quickly.
        "Cache-Control": "private, max-age=30",
      },
    },
  );
}
