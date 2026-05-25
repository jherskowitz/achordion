import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { isFeatureEnabled } from "@/lib/flags";
import { indexListenAlong } from "@/lib/listen-along-index";

/**
 * Record one listen-along event.
 *
 * Two auth surfaces, one indexer. Both end in the same Upstash
 * sorted-set write via `indexListenAlong` and the same
 * `[listen-along] event:` log line, so log greps stay uniform
 * regardless of which surface fired.
 *
 * ## Surface A — browser beacon (session-cookie auth)
 *
 * Called via `navigator.sendBeacon` from `<ListenAlongLink>` when a
 * signed-in viewer clicks the Listen along pill AND Parachord's
 * desktop client is confirmed connected (via `useParachordPresence`).
 * The beacon never blocks the click; the parachord:// navigation
 * still fires whether or not we record.
 *
 *   Body: `{ target: <lb-username> }`
 *   Auth: Auth.js session cookie → viewer = `session.user.mbUsername`.
 *
 * ## Surface B — Parachord apps (bearer-token auth)
 *
 * Called server-to-server from Parachord desktop / mobile when the
 * user starts a listen-along session through Parachord's own UI
 * (not via the Achordion pill). Lets the event still surface on
 * Achordion feeds for the target + the actor's followers.
 *
 *   Body: `{ viewer: <lb-username>, target: <lb-username> }`
 *   Auth: `Authorization: Bearer <PARACHORD_TRACK_LINKS_TOKEN>`
 *         (reused across all Parachord submit endpoints — one logical
 *          write contract from one writer).
 *
 * ## Common gates (both surfaces)
 *
 *   - `listen-along-events` feature flag (kill switch + rollout
 *     control, per-user allowlist via admin).
 *   - Self-target rejected (`viewer === target` is a meaningless
 *     loop and the indexer would skip it anyway).
 *   - 60s dedupe per (viewer → target) pair inside
 *     `indexListenAlong` so a flaky click / reconnect doesn't spam.
 *
 * ## Response
 *
 *   `{ ok: true, recorded: boolean }`
 *
 * `recorded=true` means a new Upstash entry was written.
 * `recorded=false` means the request was accepted but dropped
 * (flag off, self-target, dedupe window, or storage outage). Clients
 * can ignore the field — beacons / submits are fire-and-forget — or
 * use it to surface "tuned in" UI.
 */
export const dynamic = "force-dynamic";

const SessionBodySchema = z.object({
  // MB usernames are at least 3 chars at LB; cap at 64 to avoid an
  // unbounded payload while still accepting any legitimate handle.
  target: z.string().trim().min(1).max(64),
});

const BearerBodySchema = SessionBodySchema.extend({
  viewer: z.string().trim().min(1).max(64),
});

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
};

function readBearer(request: NextRequest): string | null {
  const header = request.headers.get("authorization") ?? "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m?.[1].trim() ?? null;
}

interface ResolvedAuth {
  viewer: string;
  /** Tag for log lines: "beacon" = session cookie / browser path,
   *  "submit" = bearer / Parachord server-to-server path. */
  source: "beacon" | "submit";
}

/**
 * Resolve auth for one request. Bearer-token requests take priority
 * over session cookies — Parachord apps may have an unrelated
 * Achordion session cookie in the request if the user is also
 * signed into the website in the same browser-ish context (rare,
 * but possible on Parachord-desktop's embedded webviews).
 *
 * Returns `{ viewer, source }` on success, or a NextResponse on
 * rejection (so the caller can early-return without re-checking).
 */
async function resolveAuth(
  request: NextRequest,
  body: unknown,
): Promise<ResolvedAuth | NextResponse> {
  const presented = readBearer(request);
  if (presented) {
    const expected = process.env.PARACHORD_TRACK_LINKS_TOKEN;
    if (!expected) {
      console.warn(
        "[listen-along] submit: rejected (endpoint not configured — PARACHORD_TRACK_LINKS_TOKEN unset)",
      );
      return NextResponse.json(
        { error: "endpoint not configured" },
        { status: 503, headers: NO_STORE },
      );
    }
    if (presented !== expected) {
      console.warn(
        `[listen-along] submit: rejected (bearer mismatch — presented ${presented.length}-char token, expected ${expected.length}-char)`,
      );
      return NextResponse.json(
        { error: "unauthorized" },
        { status: 401, headers: NO_STORE },
      );
    }
    const parsed = BearerBodySchema.safeParse(body);
    if (!parsed.success) {
      console.warn(
        `[listen-along] submit: invalid payload — ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      );
      return NextResponse.json(
        { error: "invalid payload (bearer path requires { viewer, target })" },
        { status: 400, headers: NO_STORE },
      );
    }
    return { viewer: parsed.data.viewer, source: "submit" };
  }

  // No bearer → session cookie path.
  const session = await auth();
  const viewer = session?.user?.mbUsername;
  if (!viewer) {
    console.warn("[listen-along] beacon: rejected (no session, no bearer)");
    return NextResponse.json(
      { error: "not signed in" },
      { status: 401, headers: NO_STORE },
    );
  }
  return { viewer, source: "beacon" };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Parse the JSON body once. Both auth surfaces need it; the schema
  // they each apply differs slightly (bearer requires `viewer`).
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    console.warn("[listen-along] event: invalid JSON");
    return NextResponse.json(
      { error: "invalid body" },
      { status: 400, headers: NO_STORE },
    );
  }

  const authResult = await resolveAuth(request, body);
  if (authResult instanceof NextResponse) return authResult;
  const { viewer, source } = authResult;

  if (!(await isFeatureEnabled("listen-along-events", viewer))) {
    console.warn(
      `[listen-along] ${source}: dropped (flag off for viewer=${viewer})`,
    );
    return NextResponse.json(
      { ok: true, recorded: false },
      { headers: NO_STORE },
    );
  }

  // On the bearer path we've already parsed with BearerBodySchema
  // inside resolveAuth, but we still need to extract `target` from
  // the body for the session path (and trust-but-verify on the
  // bearer path). Re-parsing with the looser SessionBodySchema
  // gives us `target` either way.
  const parsed = SessionBodySchema.safeParse(body);
  if (!parsed.success) {
    console.warn(
      `[listen-along] ${source}: invalid payload viewer=${viewer} — ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    );
    return NextResponse.json(
      { error: "invalid payload" },
      { status: 400, headers: NO_STORE },
    );
  }
  const { target } = parsed.data;
  if (target.toLowerCase() === viewer.toLowerCase()) {
    console.warn(
      `[listen-along] ${source}: self-target dropped viewer=${viewer}`,
    );
    return NextResponse.json(
      { ok: true, recorded: false },
      { headers: NO_STORE },
    );
  }

  const recorded = await indexListenAlong({
    fromUser: viewer,
    toUser: target,
  });
  console.log(
    `[listen-along] ${source}: viewer=${viewer} target=${target} recorded=${recorded}`,
  );
  return NextResponse.json({ ok: true, recorded }, { headers: NO_STORE });
}
