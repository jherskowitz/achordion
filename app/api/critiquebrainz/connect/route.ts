import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { auth } from "@/auth";
import { buildAuthorizeUrl } from "@/lib/auth/critiquebrainz";
import { setCbStateCookie } from "@/lib/cb-token";

/**
 * Kicks off the CritiqueBrainz OAuth flow. The user must already be
 * MB-signed-in (we tie the resulting CB token to their browser
 * session via cookies; there's no point starting a flow we can't
 * complete on a logged-out viewer).
 *
 * Sets a short-lived state cookie for CSRF protection and 302s to
 * CritiqueBrainz's authorize endpoint. The matching `callback`
 * route consumes the state cookie.
 *
 * Optional `?return=<path>` query param controls where we redirect
 * after the round trip completes — defaults to "/".
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.mbUsername) {
    return NextResponse.json(
      { error: "must be signed in" },
      { status: 401 },
    );
  }

  const clientId = process.env.AUTH_CRITIQUEBRAINZ_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "CritiqueBrainz OAuth is not configured" },
      { status: 500 },
    );
  }

  // Sanitise the post-callback return path: only same-origin, only
  // absolute-rooted ("/foo"), no protocol-relative ("//evil"), no
  // queries that would let an attacker craft a phishing-ish URL.
  const rawReturn = request.nextUrl.searchParams.get("return");
  const returnTo =
    rawReturn && /^\/[^/]/.test(rawReturn) ? rawReturn : "/";

  // 32-byte random state, doubles as CSRF nonce. Encoded with the
  // intended return path so we can recover it after the round trip.
  const nonce = randomBytes(32).toString("base64url");
  const state = `${nonce}|${returnTo}`;
  await setCbStateCookie(state);

  const redirectUri = new URL(
    "/api/critiquebrainz/callback",
    request.nextUrl,
  ).toString();
  const authorizeUrl = buildAuthorizeUrl({
    clientId,
    redirectUri,
    state,
  });
  return NextResponse.redirect(authorizeUrl);
}
