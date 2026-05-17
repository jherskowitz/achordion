import { ImageResponse } from "next/og";
import { getArtist } from "@/lib/clients/musicbrainz";
import { resolveArtistImage } from "@/components/achordion/artist-avatar";
import { dicebearShapesPngUrl } from "@/lib/dicebear-shapes";

/**
 * Dynamic Open Graph image for `/artist/<mbid>`.
 *
 * 1200×630 card showing the artist's hero photo on the left (from
 * Wikidata P18 / fanart.tv via `resolveArtistImage`) with the
 * name + top genre on the right. Falls back to a generic
 * Achordion-branded card when MB / the image-resolver chain
 * doesn't produce a usable artist photo.
 *
 * Edge sandbox same rules as the release-group OG:
 *   - inline styles only
 *   - no `server-only` imports
 *   - cover URLs that 307-redirect (CAA, Wikipedia Commons) work
 *     fine — `ImageResponse` follows redirects.
 */

export const runtime = "nodejs";
export const contentType = "image/png";
export const size = { width: 1200, height: 630 };
export const alt = "Artist on Achordion";

interface OgProps {
  params: Promise<{ mbid: string }>;
}

export default async function ArtistOg({ params }: OgProps) {
  const { mbid } = await params;

  let artist;
  try {
    artist = await getArtist(mbid);
  } catch {
    return fallback();
  }

  // resolveArtistImage chains Wikidata → fanart.tv. Width is a hint
  // for fanart's sized variants; the OG card uses a 516px square so
  // a 600px hint comfortably covers both halves of pixel-density
  // displays once the scrapers downscale.
  const hero = await resolveArtistImage(mbid, artist, 600);
  const topGenre =
    pickTopName(artist.genres) ?? pickTopName(artist.tags) ?? null;
  const country = artist.country ?? null;

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
          <img
            // Hero photo when Wikidata / fanart.tv produced one;
            // DiceBear shapes seeded by MBID otherwise — mirrors the
            // in-app <ArtistAvatar> fallback so an artist who shows
            // up as a coloured shape in the app shows up as the
            // same shape on shared links. PNG variant required for
            // satori (the SVG variant doesn't render reliably under
            // next/og — same reason the user OG uses PNG too).
            src={hero.url ?? dicebearShapesPngUrl(mbid, 516)}
            alt=""
            width={516}
            height={516}
            style={{
              width: 516,
              height: 516,
              objectFit: "cover",
              borderRadius: 999,
              boxShadow: "0 24px 64px rgba(0, 0, 0, 0.6)",
            }}
          />
        </div>

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
              Artist
            </span>
            <span
              style={{
                fontSize: 64,
                fontWeight: 700,
                lineHeight: 1.05,
                letterSpacing: -1,
              }}
            >
              {clamp(artist.name, 80)}
            </span>
            {topGenre && (
              <span
                style={{
                  fontSize: 28,
                  color: "#d4d4d4",
                  marginTop: 4,
                  textTransform: "capitalize",
                }}
              >
                {topGenre}
              </span>
            )}
            {country && (
              <span
                style={{ fontSize: 22, color: "#a3a3a3", marginTop: 8 }}
              >
                {country}
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

function pickTopName(
  entries: ReadonlyArray<{ name: string; count: number }> | undefined,
): string | null {
  if (!entries || entries.length === 0) return null;
  const sorted = [...entries].sort((a, b) => b.count - a.count);
  return sorted[0]?.name ?? null;
}

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
