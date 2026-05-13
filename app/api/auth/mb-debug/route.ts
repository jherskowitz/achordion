import { NextResponse, type NextRequest } from "next/server";
import { decode, getToken } from "next-auth/jwt";
import { auth } from "@/auth";

/**
 * Debug-only diagnostic for the MB OAuth JWT shape.
 *
 * Returns whether the current session has `mbAccessToken` and what
 * `mbScope` was granted, without leaking the actual token. Used to
 * triangulate the "I re-auth'd but the vote still 401s" failure
 * mode where Auth.js short-circuits a same-provider sign-in.
 *
 * Tests two decode paths because we hit a v5-beta footgun where
 * `getToken()` returns null despite a valid cookie that `auth()` can
 * decode — `getToken`'s default cookie-name / salt didn't match
 * Auth.js's encode side. The fix is to call `decode()` directly with
 * explicit cookie name + salt. Both paths shown here so a regression
 * in either direction is visible at a glance.
 *
 * Safe to leave in place — it intentionally does not expose any
 * secret material, just the booleans + scope string.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth();

  // Old path — getToken with default config. Returns null in v5 beta
  // for HTTPS requests; we keep this here as a canary so the bug is
  // re-detectable if the v5 beta ships a fix that changes the
  // defaults.
  const viaGetToken = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
  });

  // New path — explicit cookie name + salt matching Auth.js v5's
  // encode side. This is what the tag-vote route uses for real.
  const secureCookie =
    request.url.startsWith("https://") ||
    request.headers.get("x-forwarded-proto") === "https";
  const cookieName = secureCookie
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
  const cookie = request.cookies.get(cookieName)?.value;
  let viaDecode: Record<string, unknown> | null = null;
  if (cookie && process.env.AUTH_SECRET) {
    try {
      viaDecode = (await decode({
        token: cookie,
        secret: process.env.AUTH_SECRET,
        salt: cookieName,
      })) as Record<string, unknown> | null;
    } catch {
      viaDecode = null;
    }
  }

  return NextResponse.json(
    {
      signedIn: !!session?.user?.mbUsername,
      mbUsername: session?.user?.mbUsername ?? null,
      sessionMbScope: session?.user?.mbScope ?? null,

      viaGetToken: {
        hasMbAccessToken: typeof viaGetToken?.mbAccessToken === "string",
        mbScope:
          typeof viaGetToken?.mbScope === "string" ? viaGetToken.mbScope : null,
      },

      viaDecode: {
        cookiePresent: !!cookie,
        cookieName,
        hasMbAccessToken: typeof viaDecode?.mbAccessToken === "string",
        mbAccessTokenPrefix:
          typeof viaDecode?.mbAccessToken === "string"
            ? (viaDecode.mbAccessToken as string).slice(0, 6) + "…"
            : null,
        mbScope:
          typeof viaDecode?.mbScope === "string" ? viaDecode.mbScope : null,
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
