import { NextResponse, type NextRequest } from "next/server";
import { Redis } from "@upstash/redis";
import { requireAdmin } from "@/lib/admin";

/**
 * Admin-only read-through for the listen-along Upstash indexes.
 *
 * `GET /api/admin/listen-along?user=<lb-username>` returns both
 * sides of the index for that user:
 *   - `from`: events where the user is the actor (clicks they made)
 *   - `to`:   events where the user is the target (clicks made on
 *             their profile / on-air widget)
 *
 * Used to debug "I clicked Listen along but nothing shows in the
 * feed." Tells you whether the beacon actually landed in Upstash
 * regardless of the flag / reader logic on top.
 */
export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
};

const redis = (() => {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
})();

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json(
      { error: "forbidden" },
      { status: 404, headers: NO_STORE },
    );
  }
  if (!redis) {
    return NextResponse.json(
      { error: "Upstash not configured" },
      { status: 500, headers: NO_STORE },
    );
  }
  const url = new URL(request.url);
  const user = url.searchParams.get("user")?.trim().toLowerCase();
  if (!user) {
    return NextResponse.json(
      { error: "missing `user` query param" },
      { status: 400, headers: NO_STORE },
    );
  }
  // Pull everything (sorted-set has at most MAX_PER_USER = 200 per
  // side per the indexer) and parse client-side for the debug view.
  const [fromRaw, toRaw] = await Promise.all([
    redis
      .zrange<string[]>(`listen-along:from:${user}`, 0, -1)
      .catch(() => [] as string[]),
    redis
      .zrange<string[]>(`listen-along:to:${user}`, 0, -1)
      .catch(() => [] as string[]),
  ]);
  const parse = (s: string) => {
    try {
      return typeof s === "string" ? JSON.parse(s) : s;
    } catch {
      return { malformed: true, raw: s };
    }
  };
  return NextResponse.json(
    {
      user,
      from: fromRaw.map(parse),
      to: toRaw.map(parse),
      counts: { from: fromRaw.length, to: toRaw.length },
    },
    { headers: NO_STORE },
  );
}
