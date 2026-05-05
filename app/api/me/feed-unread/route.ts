import { cookies } from "next/headers";
import { auth } from "@/auth";
import { getLbTokenForRequest } from "@/lib/lb-token";
import { getUserFeed } from "@/lib/clients/listenbrainz";

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
  const events = await getUserFeed(viewer, token, { count: 50 });
  if (events === null) {
    return Response.json({ count: 0, lastSeenTs }, { status: 200 });
  }

  // Unread = newer than lastSeen AND not authored by the viewer. New
  // viewers (no cookie yet) get a baseline of zero — we don't want
  // a brand-new sign-in to flash a "50 unread" badge.
  const cutoff = lastSeenTs ?? Math.floor(Date.now() / 1000);
  let count = 0;
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
