import "server-only";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

import { stripHtml } from "@/lib/strip-html";

const USER_AGENT =
  "Achordion/0.1 (+https://github.com/jherskowitz/achordion)";

export interface SpinbinTrack {
  title: string;
  creator: string;
  album: string | null;
  /** Absolute URL to artwork; null when the source feed didn't carry one. */
  image: string | null;
}

export interface SpinbinPlaylist {
  /** XSPF `<title>`. */
  title: string;
  creator: string | null;
  /** ISO timestamp pulled from `<date>` — when spinbin generated the file. */
  date: string | null;
  info: string | null;
  /**
   * Absolute URL to a playlist-level cover image. Spinbin emits this
   * as `<image>` at the playlist level (above `<trackList>`) — used
   * for station logos. `null` when the feed doesn't carry one, in
   * which case the UI falls back to the brand-colour tile.
   */
  image: string | null;
  tracks: SpinbinTrack[];
}

/**
 * Decode the small set of HTML entities the spinbin XSPFs use. The
 * generator already escapes ampersands etc. inside <title>/<creator>
 * elements, and tracks like "Language &amp; Miscellaneous" need to round-
 * trip back to the literal "Language & Miscellaneous" before they hit
 * the page. Decode `&amp;` last so we don't double-decode `&amp;lt;`.
 */
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function pickTag(xml: string, tag: string): string | null {
  const m = xml.match(
    new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i"),
  );
  return m ? decodeEntities(m[1].trim()) : null;
}

function parseXspf(xml: string): SpinbinPlaylist {
  const title = pickTag(xml, "title") ?? "";
  // <creator>, <image>, etc. appear both at playlist level and per-
  // track. Restrict the playlist-level reads to the head of the file
  // (everything before <trackList>) so we don't accidentally pick up
  // the first track's value.
  const playlistHead = xml.split("<trackList", 2)[0] ?? xml;
  const creator = pickTag(playlistHead, "creator");
  const date = pickTag(playlistHead, "date");
  const info = pickTag(playlistHead, "info");
  const image = pickTag(playlistHead, "image");

  const tracks: SpinbinTrack[] = [];
  const trackRe = /<track\b[^>]*>([\s\S]*?)<\/track>/gi;
  let m: RegExpExecArray | null;
  while ((m = trackRe.exec(xml))) {
    const body = m[1];
    const t = pickTag(body, "title") ?? "";
    if (!t) continue;
    tracks.push({
      title: t,
      creator: pickTag(body, "creator") ?? "",
      album: pickTag(body, "album"),
      image: pickTag(body, "image"),
    });
  }
  return {
    title: stripHtml(title) || "Untitled playlist",
    creator,
    date,
    info,
    image,
    tracks,
  };
}

/**
 * Fetch and parse a spinbin XSPF playlist. Always live (`cache: 'no-store'`)
 * — the user said "refreshes on each load" and spinbin regenerates the
 * file once a day, so any cache here would mostly hide updates. The
 * underlying GitHub Pages CDN already handles the request volume.
 *
 * Returns null on network failure / non-2xx / parse error so the caller
 * can render a friendly fallback rather than throwing.
 */
export async function getSpinbinPlaylist(
  url: string,
): Promise<SpinbinPlaylist | null> {
  try {
    const res = await fetchWithTimeout(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/xspf+xml, application/xml, text/xml",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const xml = await res.text();
    if (!xml.includes("<trackList")) return null;
    return parseXspf(xml);
  } catch {
    return null;
  }
}
