import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { clearCbTokensCookie } from "@/lib/cb-token";

/**
 * Clears the CritiqueBrainz token cookie. Posted from the connect
 * UI's "Disconnect" button — POST (not GET) so a stray prefetch /
 * link can't sign the user out of CritiqueBrainz unintentionally.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.mbUsername) {
    return NextResponse.json(
      { error: "must be signed in" },
      { status: 401 },
    );
  }
  await clearCbTokensCookie();
  // Same-origin redirect target, defensively gated like /connect.
  const rawReturn = request.nextUrl.searchParams.get("return");
  const returnTo =
    rawReturn && /^\/[^/]/.test(rawReturn) ? rawReturn : "/";
  return NextResponse.redirect(new URL(returnTo, request.nextUrl), {
    status: 303,
  });
}
