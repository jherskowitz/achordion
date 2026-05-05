import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { hasUserLbToken } from "@/lib/lb-token";

/**
 * Tiny "do I have a token cookie set?" probe used by the
 * track-actions menu to decide whether to fire a token-gated action
 * or pop the NeedsTokenPopover nudge instead.
 *
 * Kept as its own route so the parent page (`/user/[name]`) can stay
 * edge-cacheable — calling `auth()` / `hasUserLbToken()` server-side
 * would dynamic-render the entire page, blowing away the s-maxage
 * win that landed in 8d6fbbe.
 *
 * Returns `{ hasToken: false }` (200) for unauthenticated viewers
 * rather than 401 so the React Query consumer can treat the answer
 * uniformly without an error path.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.mbUsername) {
    return NextResponse.json({ hasToken: false });
  }
  const hasToken = await hasUserLbToken();
  return NextResponse.json({ hasToken });
}
