import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import {
  criticsPickId,
  sanitizeCriticalDarlingText,
} from "@/lib/clients/critical-darlings";
import {
  ingestCriticalDarlings,
  type StoredCriticalDarling,
} from "@/lib/critical-darlings-store";

/**
 * Critical Darlings ingest webhook.
 *
 * Replaces the RSSground-hosted feed the surface used to poll. IFTTT
 * still does the upstream work (Metacritic scrape + score>80 filter +
 * AI summary + Spotify lookup); its final action POSTs each new pick
 * here instead of publishing to an RSS feed. Configure IFTTT's "Make a
 * web request" action:
 *
 *   URL:     https://achordion.xyz/api/critical-darlings/ingest
 *   Method:  POST
 *   Header:  Authorization: Bearer <CRITICAL_DARLINGS_INGEST_TOKEN>
 *   Content: application/x-www-form-urlencoded   (see note below)
 *   Body:    title={{...}}&artist={{...}}&score={{...}}&summary={{...}}
 *            &reviewUrl={{...}}&spotifyUrl={{...}}&pubDate={{...}}
 *
 * Accepts BOTH form-encoded and JSON bodies. Form-encoded is the safer
 * default for IFTTT: its ingredient values aren't escaped, and a
 * review summary containing a `"` or newline breaks a JSON body but is
 * harmless in a form value (only a literal `&` would, which AI
 * summaries essentially never contain). JSON may be a single object or
 * an array (for a future batch producer).
 *
 * Auth mirrors the track-links / playlist-links submit endpoints:
 * bearer token in `CRITICAL_DARLINGS_INGEST_TOKEN` (a `?token=` query
 * param is accepted as a fallback for clients that can't set headers).
 */

export const dynamic = "force-dynamic";

const NO_STORE: Record<string, string> = { "Cache-Control": "private, no-store" };

const ItemSchema = z.object({
  title: z.string().trim().min(1).max(300),
  artist: z.string().trim().min(1).max(300),
  score: z.coerce.number().int().min(0).max(100).optional(),
  summary: z.string().trim().max(4000).optional(),
  reviewUrl: z.string().trim().regex(/^https?:\/\//i).max(2000).optional(),
  spotifyUrl: z.string().trim().regex(/^https?:\/\//i).max(2000).optional(),
  pubDate: z.string().trim().max(100).optional(),
});

function readToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization") ?? "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (m) return m[1].trim();
  const q = request.nextUrl.searchParams.get("token");
  return q?.trim() || null;
}

/** Drop null / empty-string values so optional fields IFTTT leaves
 *  blank don't fail validation. */
function dropEmpty(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    out[k] = v;
  }
  return out;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const expected = process.env.CRITICAL_DARLINGS_INGEST_TOKEN;
  if (!expected) {
    console.warn(
      "[crit-darlings] ingest: endpoint not configured (CRITICAL_DARLINGS_INGEST_TOKEN unset)",
    );
    return NextResponse.json(
      { ok: true, recorded: 0, reason: "endpoint not configured" },
      { status: 200, headers: NO_STORE },
    );
  }
  const presented = readToken(request);
  if (!presented) {
    console.warn("[crit-darlings] ingest: rejected (no bearer token)");
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }
  if (presented !== expected) {
    console.warn("[crit-darlings] ingest: rejected (bearer mismatch)");
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }

  // Accept form-encoded (preferred for IFTTT) or JSON (single or array).
  const contentType = request.headers.get("content-type") ?? "";
  let rawItems: unknown[];
  try {
    if (contentType.includes("application/json")) {
      const body = await request.json();
      rawItems = Array.isArray(body) ? body : [body];
    } else {
      const form = await request.formData();
      rawItems = [Object.fromEntries(form.entries())];
    }
  } catch {
    console.warn("[crit-darlings] ingest: invalid body");
    return NextResponse.json({ error: "invalid body" }, { status: 400, headers: NO_STORE });
  }

  const parsed: z.infer<typeof ItemSchema>[] = [];
  const issues: string[] = [];
  for (const raw of rawItems) {
    const result = ItemSchema.safeParse(dropEmpty(raw));
    if (result.success) parsed.push(result.data);
    else issues.push(result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }

  if (parsed.length === 0) {
    console.warn(`[crit-darlings] ingest: no valid items — ${issues.join(" | ")}`);
    return NextResponse.json(
      { error: "no valid items", issues },
      { status: 400, headers: NO_STORE },
    );
  }

  const now = Date.now();
  const items: StoredCriticalDarling[] = parsed.map((p) => ({
    id: criticsPickId(p.title, p.artist),
    title: p.title,
    artist: p.artist,
    link: p.reviewUrl ?? null,
    description: p.summary ? sanitizeCriticalDarlingText(p.summary) : "",
    spotifyUrl: p.spotifyUrl ?? null,
    pubDate: p.pubDate ?? new Date(now).toISOString(),
    score: p.score,
    ingestedAt: now,
  }));

  const recorded = await ingestCriticalDarlings(items);

  // Surface page is ISR-cached (revalidate=43200); bust it so new picks
  // appear on the next visit instead of waiting out the 12h window.
  revalidateTag("critical-darlings", "max");
  revalidatePath("/explore/critical-darlings");

  console.log(
    `[crit-darlings] ingest: items=${items.length} recorded=${recorded} first="${items[0].title} by ${items[0].artist}"`,
  );
  return NextResponse.json({ ok: true, recorded }, { headers: NO_STORE });
}
