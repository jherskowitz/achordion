import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { auth } from "@/auth";
import { exchangeCode } from "@/lib/auth/critiquebrainz";
import {
  consumeCbStateCookie,
  setCbTokensCookie,
} from "@/lib/cb-token";

/**
 * Completes the CritiqueBrainz OAuth flow. Verifies the `state` round
 * trip against the cookie set in `/connect`, exchanges the auth code
 * for an access token, drops the encrypted token cookie, and 302s
 * back to the page the user came from (recovered from the state).
 *
 * On any error we redirect home with a `?cb_error=<reason>` query
 * param so the page can flash a toast — never expose raw OAuth
 * errors in JSON, since browsers land on this URL directly.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.mbUsername) {
    return NextResponse.redirect(new URL("/login", request.nextUrl));
  }

  const clientId = process.env.AUTH_CRITIQUEBRAINZ_ID;
  const clientSecret = process.env.AUTH_CRITIQUEBRAINZ_SECRET;
  if (!clientId || !clientSecret) {
    return errorRedirect(request, "not_configured");
  }

  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const stateFromUrl = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  if (oauthError) return errorRedirect(request, oauthError);
  if (!code || !stateFromUrl) return errorRedirect(request, "missing_code");

  const stateFromCookie = await consumeCbStateCookie();
  if (!stateFromCookie || !constantTimeEqual(stateFromCookie, stateFromUrl)) {
    return errorRedirect(request, "state_mismatch");
  }

  // Recover the post-callback return path encoded into the state.
  const [, returnTo = "/"] = stateFromCookie.split("|");

  const redirectUri = new URL(
    "/api/critiquebrainz/callback",
    request.nextUrl,
  ).toString();

  try {
    const tokens = await exchangeCode({
      clientId,
      clientSecret,
      redirectUri,
      code,
    });
    await setCbTokensCookie(tokens);
  } catch {
    return errorRedirect(request, "exchange_failed");
  }

  const target = new URL(returnTo, request.nextUrl);
  target.searchParams.set("cb_connected", "1");
  return NextResponse.redirect(target);
}

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function errorRedirect(request: NextRequest, reason: string) {
  const target = new URL("/", request.nextUrl);
  target.searchParams.set("cb_error", reason);
  return NextResponse.redirect(target);
}
