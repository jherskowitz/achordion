import { cookies } from "next/headers";
import { auth } from "@/auth";

const COOKIE = "feed_seen_ts";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Mark the user's feed as "seen up to now". Called from /feed once
 * the page hydrates (and on focus, if we add that later). Idempotent.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.mbUsername) return new Response(null, { status: 401 });
  const ts = Math.floor(Date.now() / 1000);
  const store = await cookies();
  store.set(COOKIE, String(ts), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
  return Response.json({ ok: true, ts }, { status: 200 });
}
