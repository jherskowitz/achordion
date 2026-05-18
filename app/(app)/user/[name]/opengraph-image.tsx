import { ImageResponse } from "next/og";
import { getUserTopArtists } from "@/lib/clients/listenbrainz";
import { getBskyDisplayProfile } from "@/lib/bsky-display";
import { dicebearShapesPngUrl } from "@/lib/dicebear-shapes";
import { OgBrand } from "@/app/_og-brand";

/**
 * Dynamic Open Graph image for `/user/<name>`.
 *
 * 1200×630 card with the user's avatar (Bluesky-linked when
 * available, otherwise DiceBear default) on the left and their
 * username + "Currently into: A, B, C" + a small genre / count
 * line on the right. The new computed-identity stack makes a
 * particularly good OG card — much richer than the generic
 * site preview most music sites ship.
 *
 * No auth() — like the album page, this runs in an edge-cacheable
 * context. The bsky-link flag check inside getBskyDisplayProfile
 * passes with a null viewer because the flag is default-on.
 */

export const runtime = "nodejs";
export const contentType = "image/png";
export const size = { width: 1200, height: 630 };
export const alt = "Listener on Achordion";

interface OgProps {
  params: Promise<{ name: string }>;
}

export default async function UserOg({ params }: OgProps) {
  const { name } = await params;

  // Top artists this month — the "Currently into" line on the OG
  // card. 3 is the same shape the in-app user cards use.
  const topArtists = await getUserTopArtists(name, "month", 3).catch(() => []);

  // Avatar override: prefer the linked Bluesky avatar.
  const bskyDisplay = await getBskyDisplayProfile(name, null).catch(() => null);
  // PNG variant required here — satori (next/og) doesn't render
  // DiceBear's SVG URL reliably. Bluesky avatars are already PNG/
  // JPEG so they pass through unchanged.
  const avatarUrl = bskyDisplay?.avatar ?? dicebearShapesPngUrl(name, 516);

  const currentlyInto =
    topArtists.length > 0
      ? topArtists.map((a) => a.artist_name).join(", ")
      : null;

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
            src={avatarUrl}
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
              ListenBrainz user
            </span>
            <span
              style={{
                fontSize: 64,
                fontWeight: 700,
                lineHeight: 1.05,
                letterSpacing: -1,
              }}
            >
              {clamp(name, 80)}
            </span>
            {currentlyInto && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  marginTop: 12,
                }}
              >
                <span
                  style={{
                    fontSize: 16,
                    letterSpacing: 1.5,
                    textTransform: "uppercase",
                    color: "#737373",
                  }}
                >
                  Currently into
                </span>
                <span
                  style={{
                    fontSize: 28,
                    color: "#d4d4d4",
                    lineHeight: 1.3,
                  }}
                >
                  {clamp(currentlyInto, 120)}
                </span>
              </div>
            )}
          </div>

          <OgBrand />
        </div>
      </div>
    ),
    size,
  );
}

function clamp(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
