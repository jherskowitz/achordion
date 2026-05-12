import { ImageResponse } from "next/og";
import {
  getReleaseGroup,
  pickCanonicalRelease,
  formatArtistCredit,
} from "@/lib/clients/musicbrainz";
import { caaReleaseUrl } from "@/lib/clients/coverart";

/**
 * Dynamic Open Graph image for `/release-group/<mbid>`.
 *
 * Twitter / Discord / Slack / Bluesky / Threads all scrape this
 * URL when an Achordion album link gets posted. We render a
 * 1200×630 card with the album cover on the left and the title +
 * artist + release year on the right.
 *
 * Runs inside Next's edge image sandbox (`next/og`'s ImageResponse).
 * Constraints that fall out of that:
 *   - No Tailwind. Inline styles only.
 *   - No React imports beyond what's implicitly available.
 *   - `fetch` is fine for cover-art URLs (we just hand the URL to
 *     the `<img>` and ImageResponse loads it internally).
 *   - Don't reach for `server-only` modules — the helpers we DO
 *     use (`getReleaseGroup`, `caaReleaseUrl`) are pure data
 *     fetchers that work in any runtime.
 */

export const runtime = "nodejs";
export const contentType = "image/png";
export const size = { width: 1200, height: 630 };
export const alt = "Album on Achordion";

interface OgProps {
  params: Promise<{ mbid: string }>;
}

export default async function ReleaseGroupOg({ params }: OgProps) {
  const { mbid } = await params;

  // Fetch the same release-group payload the page itself fetches.
  // On a cold cache this is one MB call; warm hits are free since
  // the page-side fetch and this share the same Next fetch slot.
  let rg;
  try {
    rg = await getReleaseGroup(mbid);
  } catch {
    return fallback();
  }

  const credit = formatArtistCredit(rg["artist-credit"]);
  const canonical = pickCanonicalRelease(rg);
  const cover = canonical ? caaReleaseUrl(canonical.id, 500) : null;
  const year = rg["first-release-date"]?.slice(0, 4) ?? null;
  const primaryType = rg["primary-type"] ?? "Album";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundColor: "#0a0a0a",
          color: "#fafafa",
          fontFamily: "system-ui",
        }}
      >
        {/* Left half: cover art. Fills exactly 50% of the card so
            the right text column gets predictable space. Square
            aspect via height=width=515 (630 - 2×57 padding). */}
        <div
          style={{
            width: 630,
            height: 630,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 57,
            backgroundColor: "#171717",
          }}
        >
          {cover ? (
            <img
              src={cover}
              alt=""
              width={516}
              height={516}
              style={{
                width: 516,
                height: 516,
                objectFit: "cover",
                borderRadius: 16,
                boxShadow: "0 24px 64px rgba(0, 0, 0, 0.6)",
              }}
            />
          ) : (
            <div
              style={{
                width: 516,
                height: 516,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 16,
                backgroundColor: "#262626",
                color: "#737373",
                fontSize: 96,
              }}
            >
              ♪
            </div>
          )}
        </div>

        {/* Right half: byline + title + artist + meta + brand. */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "57px 64px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <span
              style={{
                fontSize: 18,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: "#a3a3a3",
              }}
            >
              {primaryType}
            </span>
            <span
              style={{
                fontSize: 64,
                fontWeight: 700,
                lineHeight: 1.05,
                letterSpacing: -1,
              }}
            >
              {clamp(rg.title, 80)}
            </span>
            <span
              style={{
                fontSize: 32,
                fontWeight: 500,
                color: "#d4d4d4",
                marginTop: 4,
              }}
            >
              {clamp(credit.name, 70)}
            </span>
            {year && (
              <span
                style={{ fontSize: 22, color: "#a3a3a3", marginTop: 8 }}
              >
                {year}
              </span>
            )}
          </div>

          <Brand />
        </div>
      </div>
    ),
    size,
  );
}

/** Branded footer — small Achordion wordmark in the corner.
 *  Rendered as plain text so the card doesn't depend on font /
 *  SVG loading inside the OG sandbox. */
function Brand() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 20,
        color: "#a3a3a3",
      }}
    >
      <span
        style={{
          width: 12,
          height: 12,
          borderRadius: 999,
          backgroundColor: "#7c3aed",
        }}
      />
      <span style={{ fontWeight: 600, color: "#fafafa" }}>achordion</span>
      <span>· People-powered music discovery</span>
    </div>
  );
}

/** When MB fetch fails, fall through to a generic Achordion card
 *  rather than 500ing the OG request — scrapers see SOMETHING
 *  rather than a broken preview link. */
function fallback() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0a0a0a",
          color: "#fafafa",
          fontFamily: "system-ui",
        }}
      >
        <span style={{ fontSize: 72, fontWeight: 700 }}>achordion</span>
        <span style={{ fontSize: 28, color: "#a3a3a3", marginTop: 16 }}>
          People-powered music discovery
        </span>
      </div>
    ),
    size,
  );
}

function clamp(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
