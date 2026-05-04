import { ImageResponse } from "next/og";

/**
 * Sitewide default OpenGraph image. Generated at request time by
 * Next's edge runtime via the `next/og` ImageResponse API — no static
 * asset to maintain, no design tool round-trip, easy to tweak.
 *
 * Per-page OG images can override this by exporting their own
 * `opengraph-image.tsx` from the route's directory (e.g. an artist
 * page that wants the artist photo + name in the unfurl).
 */

export const alt = "Achordion — the independent music community";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Brand colors mirror the wordmark accent + the dark slate backdrop
// that reads well on every social platform's card chrome (Threads,
// Bluesky, Slack, iMessage, Mastodon — all have light-tinted card
// backgrounds, so dark+saturated wins).
const ACCENT = "#774BE9";
const BG = "#0f172a"; // slate-900

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          padding: "80px",
          background: BG,
          // Subtle radial highlight under the wordmark adds depth without
          // making the image feel busy in a small unfurl thumbnail.
          backgroundImage: `radial-gradient(ellipse at 30% 50%, ${ACCENT}26 0%, ${BG} 60%)`,
          color: "white",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "12px",
            fontSize: "120px",
            fontWeight: 700,
            letterSpacing: "-0.04em",
            lineHeight: 1,
          }}
        >
          Achordion
          <span
            style={{
              width: "20px",
              height: "20px",
              background: ACCENT,
              borderRadius: "4px",
              marginLeft: "4px",
            }}
          />
        </div>
        <div
          style={{
            marginTop: "24px",
            fontSize: "36px",
            fontWeight: 500,
            color: "#cbd5e1", // slate-300
            letterSpacing: "-0.01em",
            lineHeight: 1.2,
            maxWidth: "920px",
          }}
        >
          The independent music community and data layer.
        </div>
        <div
          style={{
            marginTop: "16px",
            fontSize: "26px",
            fontWeight: 400,
            color: "#94a3b8", // slate-400
            lineHeight: 1.3,
            maxWidth: "920px",
          }}
        >
          A modern open-source front-end for ListenBrainz, designed to feel
          like one product with Parachord.
        </div>
        <div
          style={{
            position: "absolute",
            bottom: "60px",
            left: "80px",
            display: "flex",
            alignItems: "center",
            gap: "16px",
            fontSize: "24px",
            color: "#64748b", // slate-500
          }}
        >
          <span style={{ color: ACCENT, fontWeight: 600 }}>achordion.xyz</span>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
