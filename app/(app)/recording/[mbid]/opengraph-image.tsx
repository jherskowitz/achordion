import { ImageResponse } from "next/og";
import {
  getRecording,
  formatArtistCredit,
  type RecordingRelease,
} from "@/lib/clients/musicbrainz";
import { caaReleaseUrl } from "@/lib/clients/coverart";
import { OgBrand } from "@/app/_og-brand";

/**
 * Dynamic Open Graph image for `/recording/<mbid>`.
 *
 * 1200×630 card: hero release's cover on the left, track title +
 * artist credit + (year, length) line on the right. Same split-
 * panel template as the release-group OG so a "Hey Jude" track
 * card visually reads as the album card's sibling.
 *
 * Edge sandbox same rules — inline styles only, no Tailwind, no
 * `server-only` imports. Cover comes from CAA via a 307 redirect
 * to archive.org; ImageResponse follows redirects.
 */

export const runtime = "nodejs";
export const contentType = "image/png";
export const size = { width: 1200, height: 630 };
export const alt = "Track on Achordion";

interface OgProps {
  params: Promise<{ mbid: string }>;
}

export default async function RecordingOg({ params }: OgProps) {
  const { mbid } = await params;

  let recording;
  try {
    recording = await getRecording(mbid);
  } catch {
    return fallback();
  }

  const credit = formatArtistCredit(recording["artist-credit"]);
  const heroRelease = pickHeroRelease(recording.releases);
  const cover = heroRelease ? caaReleaseUrl(heroRelease.id, 500) : null;
  const length = formatLength(recording.length);
  const year = recording["first-release-date"]?.slice(0, 4) ?? null;
  // Compact meta line under the artist — "1968 · 7:11"
  const metaBits = [year, length].filter((x): x is string => !!x);
  const meta = metaBits.length > 0 ? metaBits.join(" · ") : null;

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
              Track
            </span>
            <span
              style={{
                fontSize: 64,
                fontWeight: 700,
                lineHeight: 1.05,
                letterSpacing: -1,
              }}
            >
              {clamp(recording.title, 80)}
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
            {meta && (
              <span
                style={{ fontSize: 22, color: "#a3a3a3", marginTop: 8 }}
              >
                {meta}
              </span>
            )}
          </div>
          <OgBrand />
        </div>
      </div>
    ),
    size,
  );
}

/** Mirror of pickHeroRelease in the recording page — official + earliest. */
function pickHeroRelease(
  releases: RecordingRelease[] | undefined,
): RecordingRelease | null {
  if (!releases || releases.length === 0) return null;
  const official = releases.filter((r) => r.status === "Official");
  const pool = official.length > 0 ? official : releases;
  return (
    pool
      .slice()
      .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"))[0] ?? null
  );
}

function formatLength(ms: number | null | undefined): string | null {
  if (!ms || ms <= 0) return null;
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
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
          gap: 8,
        }}
      >
        <OgBrand />
      </div>
    ),
    size,
  );
}

function clamp(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
