import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { auth } from "@/auth";

/**
 * Debug-only diagnostic for the MB OAuth JWT shape.
 *
 * Returns whether the current session has `mbAccessToken` and what
 * `mbScope` was granted, without leaking the actual token. Used to
 * triangulate the "I re-auth'd but the vote still 401s" failure
 * mode where Auth.js short-circuits a same-provider sign-in.
 *
 * Safe to leave in place — it intentionally does not expose any
 * secret material, just the booleans + scope string.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  const jwt = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
  });
  return NextResponse.json(
    {
      signedIn: !!session?.user?.mbUsername,
      mbUsername: session?.user?.mbUsername ?? null,
      hasMbAccessToken: typeof jwt?.mbAccessToken === "string",
      mbAccessTokenPrefix:
        typeof jwt?.mbAccessToken === "string"
          ? jwt.mbAccessToken.slice(0, 6) + "…"
          : null,
      mbScope: typeof jwt?.mbScope === "string" ? jwt.mbScope : null,
      sessionMbScope: session?.user?.mbScope ?? null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
