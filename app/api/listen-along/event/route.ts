import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { isFeatureEnabled } from "@/lib/flags";
import { indexListenAlong } from "@/lib/listen-along-index";

/**
 * Record one listen-along click.
 *
 * Called via `navigator.sendBeacon('/api/listen-along/event', ...)`
 * from `<LiveOnAirIndicator>` whenever a viewer clicks the listen-
 * along pill AND Parachord's desktop app is confirmed connected.
 * The beacon never blocks the click — failure of this route never
 * affects the user-visible action (Parachord opens regardless).
 *
 * Gates:
 *   1. Session required — anonymous beacons drop on the floor.
 *   2. `listen-along-events` feature flag — kill switch + rollout
 *      control. Per-user allowlist supported in admin.
 *   3. Per-actor dedupe inside `indexListenAlong` — repeat clicks
 *      against the same target within 60s collapse to one event.
 *
 * Request shape: `{ target: <lb-username> }`. We trust the client-
 * supplied target only to the extent that LB itself wouldn't —
 * users can forge a beacon, but the worst they can do is record
 * themselves clicking listen-along on someone else (no privilege
 * granted, no resource fetched, just an event log line).
 *
 * Response: `{ ok, recorded }` where `recorded` distinguishes a new
 * write from a dedupe-skipped one. Used by clients that want to
 * surface "tuned in" UI; the beacon caller ignores it.
 */
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  // MB usernames are at least 3 chars at LB; cap at 64 to avoid an
  // unbounded payload while still accepting any legitimate handle.
  target: z.string().trim().min(1).max(64),
});

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Log every attempt so "I clicked Listen along but nothing shows
  // up" can be debugged from `vercel logs` without guessing whether
  // the beacon landed. Each branch tags its outcome.
  const session = await auth();
  const viewer = session?.user?.mbUsername;
  if (!viewer) {
    console.warn("[listen-along] beacon: rejected (no session)");
    return NextResponse.json(
      { error: "not signed in" },
      { status: 401, headers: NO_STORE },
    );
  }
  if (!(await isFeatureEnabled("listen-along-events", viewer))) {
    console.warn(
      `[listen-along] beacon: dropped (flag off for viewer=${viewer})`,
    );
    return NextResponse.json({ ok: true, recorded: false }, { headers: NO_STORE });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    console.warn(`[listen-along] beacon: invalid JSON viewer=${viewer}`);
    return NextResponse.json(
      { error: "invalid body" },
      { status: 400, headers: NO_STORE },
    );
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    console.warn(
      `[listen-along] beacon: invalid payload viewer=${viewer} — ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    );
    return NextResponse.json(
      { error: "invalid payload" },
      { status: 400, headers: NO_STORE },
    );
  }
  const { target } = parsed.data;
  if (target.toLowerCase() === viewer.toLowerCase()) {
    console.warn(
      `[listen-along] beacon: self-target dropped viewer=${viewer}`,
    );
    return NextResponse.json({ ok: true, recorded: false }, { headers: NO_STORE });
  }

  const recorded = await indexListenAlong({
    fromUser: viewer,
    toUser: target,
  });
  console.log(
    `[listen-along] beacon: viewer=${viewer} target=${target} recorded=${recorded}`,
  );
  return NextResponse.json({ ok: true, recorded }, { headers: NO_STORE });
}
