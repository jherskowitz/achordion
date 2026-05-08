import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

/**
 * Read-only lookup that returns a ready-to-paste iframe snippet for
 * Achordion's track / album embed widgets. Built so Parachord (and
 * any other authorized client) can render a "Copy embed code" UI in
 * its share sheet without hard-coding our embed URL conventions or
 * recommended dimensions — both ship from this endpoint.
 *
 * Inputs:
 *   - `entity`: `track` | `album`. Aliases: `recording` → track,
 *     `release-group` → album. Both forms accepted so callers can
 *     pass whichever vocabulary fits their domain model.
 *   - `mbid`: 36-char UUID for the entity.
 *   - `width` (optional): override the snippet's width attribute.
 *     Default 600.
 *   - `height` (optional): override the snippet's height attribute.
 *     Default 180 for track, 260 for album.
 *
 * Output:
 *   ```json
 *   {
 *     "entity": "track",
 *     "mbid": "<mbid>",
 *     "embed_url": "https://achordion.xyz/embed/track/<mbid>",
 *     "page_url": "https://achordion.xyz/recording/<mbid>",
 *     "width": 600,
 *     "height": 180,
 *     "html": "<iframe src=\"...\" width=\"600\" height=\"180\" ...></iframe>"
 *   }
 *   ```
 *
 * **Auth: bearer token, gated.** Same `ACHORDION_API_READ_TOKEN` as
 * the other Parachord-facing read endpoints. The data is derivable
 * from MBID alone — auth is conservative until we understand caller
 * volume.
 *
 * Cache: `private, no-store`. Auth'd responses don't share at the
 * edge without `Vary: Authorization`; per-request render is
 * negligibly cheap (no external calls — pure string formatting).
 */

export const dynamic = "force-dynamic";

const NO_STORE: Record<string, string> = {
  "Cache-Control": "private, no-store",
};

const ACHORDION_ORIGIN = "https://achordion.xyz";

type EmbedEntity = "track" | "album";

const ENTITY_ALIASES: Record<string, EmbedEntity> = {
  track: "track",
  recording: "track",
  album: "album",
  "release-group": "album",
};

/** Default iframe height per entity type. Mirrors what
 *  `<EmbedShareButton>` ships in the in-app dialog. */
const DEFAULT_HEIGHT: Record<EmbedEntity, number> = {
  track: 180,
  album: 260,
};

const DEFAULT_WIDTH = 600;
const MIN_DIMENSION = 200;
const MAX_DIMENSION = 2000;

const QuerySchema = z.object({
  entity: z
    .string()
    .min(1)
    .transform((v) => v.toLowerCase().trim())
    .refine((v): v is keyof typeof ENTITY_ALIASES => v in ENTITY_ALIASES, {
      message:
        "entity must be one of: track, album (aliases: recording, release-group)",
    }),
  mbid: z.string().uuid(),
  width: z.coerce
    .number()
    .int()
    .min(MIN_DIMENSION)
    .max(MAX_DIMENSION)
    .optional(),
  height: z.coerce
    .number()
    .int()
    .min(MIN_DIMENSION)
    .max(MAX_DIMENSION)
    .optional(),
});

function bearer(request: NextRequest): string | null {
  const header = request.headers.get("authorization") ?? "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m?.[1].trim() ?? null;
}

/** Routes for the canonical entity page (the "Open in Achordion"
 *  destination, not the iframe widget). */
function pagePath(entity: EmbedEntity, mbid: string): string {
  return entity === "track" ? `/recording/${mbid}` : `/release-group/${mbid}`;
}

function embedPath(entity: EmbedEntity, mbid: string): string {
  return `/embed/${entity}/${mbid}`;
}

/** Trivial HTML attribute escape — covers the only inputs we
 *  actually compose into the snippet (URLs and integers). MBIDs
 *  are already UUID-validated, so this is belt-and-braces. */
function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const expected = process.env.ACHORDION_API_READ_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: "embed-code endpoint not configured" },
      { status: 503, headers: NO_STORE },
    );
  }
  const presented = bearer(request);
  if (!presented || presented !== expected) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: NO_STORE },
    );
  }

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    entity: url.searchParams.get("entity") ?? "",
    mbid: url.searchParams.get("mbid") ?? "",
    ...(url.searchParams.get("width")
      ? { width: url.searchParams.get("width") }
      : {}),
    ...(url.searchParams.get("height")
      ? { height: url.searchParams.get("height") }
      : {}),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid query", issues: parsed.error.issues },
      { status: 400, headers: NO_STORE },
    );
  }

  const entity = ENTITY_ALIASES[parsed.data.entity];
  const { mbid } = parsed.data;
  const width = parsed.data.width ?? DEFAULT_WIDTH;
  const height = parsed.data.height ?? DEFAULT_HEIGHT[entity];

  const embedUrl = `${ACHORDION_ORIGIN}${embedPath(entity, mbid)}`;
  const pageUrl = `${ACHORDION_ORIGIN}${pagePath(entity, mbid)}`;
  const title = `Achordion ${entity}`;

  // Style attribute matches what <EmbedShareButton> ships in-app:
  // zero border + 12px corner-radius for a clean drop-in look.
  const html = `<iframe src="${escapeAttr(
    embedUrl,
  )}" width="${width}" height="${height}" loading="lazy" style="border:0;border-radius:12px" title="${escapeAttr(
    title,
  )}"></iframe>`;

  return NextResponse.json(
    {
      entity,
      mbid,
      embed_url: embedUrl,
      page_url: pageUrl,
      width,
      height,
      html,
    },
    { headers: NO_STORE },
  );
}
