import { ImageResponse } from "next/og";
import { OgBrand } from "@/app/_og-brand";

/**
 * Shared Open Graph card for the top-level section/tab pages (Charts,
 * Explore sub-tabs like New Releases / Critical Darlings, Radio, …).
 *
 * These routes are static landing pages with no single entity to feature,
 * so instead of the per-entity cover layout they get a text-forward card:
 * accent + eyebrow, big title, one-line subtitle, brand footer. Without
 * this every section link unfurled as the generic root `opengraph-image.png`
 * (the landing card).
 *
 * Runs in Next's `next/og` sandbox — same constraints as the entity OG
 * images: inline styles only, no Tailwind, no `server-only` imports.
 */
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

function clamp(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

export function renderSectionOg({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#0a0a0a",
          color: "#fafafa",
          fontFamily: "system-ui",
          padding: "76px 80px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Accent bar + section eyebrow. Purple is the brand hex the
              wordmark 'i' uses (satori needs it spelled out). */}
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div
              style={{
                width: 52,
                height: 8,
                borderRadius: 4,
                backgroundColor: "#774BE9",
              }}
            />
            <span
              style={{
                fontSize: 24,
                letterSpacing: 4,
                textTransform: "uppercase",
                color: "#a3a3a3",
                fontWeight: 600,
              }}
            >
              {eyebrow}
            </span>
          </div>
          <span
            style={{
              fontSize: 86,
              fontWeight: 700,
              lineHeight: 1.03,
              letterSpacing: -2,
              maxWidth: 1040,
            }}
          >
            {clamp(title, 44)}
          </span>
          <span
            style={{
              fontSize: 34,
              fontWeight: 500,
              color: "#d4d4d4",
              lineHeight: 1.3,
              maxWidth: 980,
              marginTop: 8,
            }}
          >
            {clamp(subtitle, 130)}
          </span>
        </div>

        <OgBrand />
      </div>
    ),
    OG_SIZE,
  );
}
