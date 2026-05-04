import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Edge bot block — robots.txt is the polite ask, this is the hard
 * floor. We saw artist pages timing out at 5 minutes under crawler
 * load because every page-component MB call serializes behind our
 * shared 1-req/sec MB rate limit; AI training scrapers in particular
 * walk catalog routes aggressively and most of them ignore robots.txt
 * either entirely or after a delay. This handles them at the edge,
 * before they reach the route handlers and burn an MB-queue slot.
 *
 * Pattern is intentionally narrow — only known-bad UAs are blocked.
 * Legitimate search crawlers (Googlebot, Bingbot, DuckDuckBot) pass
 * through and are governed by robots.txt instead.
 */
const BLOCKED_UA =
  /(GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-Web|anthropic-ai|CCBot|PerplexityBot|Google-Extended|Applebot-Extended|Bytespider|Amazonbot|FacebookBot|Meta-ExternalAgent|DuckAssistBot|Diffbot|AhrefsBot|SemrushBot|MJ12bot|DotBot|PetalBot|DataForSeoBot|BLEXBot|SeekportBot|Barkrowler)/i;

export function middleware(request: NextRequest) {
  const ua = request.headers.get("user-agent") ?? "";
  if (BLOCKED_UA.test(ua)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  // Skip Next internals + static assets — the cost of bot-checking
  // every chunk fetch isn't worth it. We only care about page +
  // API routes.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|parachord-hero.png).*)"],
};
