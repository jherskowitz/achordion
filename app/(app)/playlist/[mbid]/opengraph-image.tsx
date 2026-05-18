import { ImageResponse } from "next/og";
import { getPlaylist } from "@/lib/clients/listenbrainz";
import { caaReleaseUrl } from "@/lib/clients/coverart";
import { OgBrand } from "@/app/_og-brand";

/**
 * Dynamic Open Graph image for `/playlist/<mbid>`.
 *
 * 1200×630 card: a 2×2 mosaic of cover-art tiles from the first
 * four tracks that have a release MBID, with title + creator +
 * track-count on the right. Mosaic-shape cards perform well on
 * Discord / Slack / Bluesky / Threads when sharing playlist
 * URLs — visually distinct from the single-cover album / track
 * cards, instantly readable as "this is a collection."
 *
 * Falls back to a generic Achordion-branded card when the
 * playlist isn't public (LB private playlists 404 without a
 * token — we don't have one in the OG context) or when no
 * tracks expose a release MBID for cover lookup.
 */

export const runtime = "nodejs";
export const contentType = "image/png";
export const size = { width: 1200, height: 630 };
export const alt = "Playlist on Achordion";

interface OgProps {
  params: Promise<{ mbid: string }>;
}

export default async function PlaylistOg({ params }: OgProps) {
  const { mbid } = await params;

  // No LB token in the OG context — only public playlists render
  // their real card. Private playlists fall through to the
  // generic Achordion branding.
  const data = await getPlaylist(mbid).catch(() => null);
  if (!data) return fallback();

  // Collect cover URLs from the first N tracks that carry a
  // release-level MBID. LB sometimes embeds a different
  // `caaReleaseMbid` when the track's primary release MBID
  // doesn't have CAA art — prefer that when available.
  const covers: string[] = [];
  for (const t of data.tracks) {
    if (covers.length >= 4) break;
    const releaseMbid = t.caaReleaseMbid ?? t.releaseMbid;
    if (!releaseMbid) continue;
    covers.push(caaReleaseUrl(releaseMbid, 500));
  }

  const trackCount = data.tracks.length;
  const trackLabel = `${trackCount} track${trackCount === 1 ? "" : "s"}`;

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
        {/* Left half: 2×2 cover mosaic. Each tile is 258×258 with a
            4px gap, totalling 520×520 — same visual footprint as
            the single-cover variant for layout consistency. */}
        <div
          style={{
            width: 630,
            height: 630,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 55,
            backgroundColor: "#171717",
          }}
        >
          <div
            style={{
              width: 520,
              height: 520,
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
              borderRadius: 16,
              overflow: "hidden",
              boxShadow: "0 24px 64px rgba(0, 0, 0, 0.6)",
            }}
          >
            {Array.from({ length: 4 }).map((_, i) => {
              const url = covers[i];
              return (
                <div
                  key={i}
                  style={{
                    width: 258,
                    height: 258,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#262626",
                  }}
                >
                  {url ? (
                    <img
                      src={url}
                      alt=""
                      width={258}
                      height={258}
                      style={{
                        width: 258,
                        height: 258,
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <span style={{ fontSize: 56, color: "#737373" }}>
                      ♪
                    </span>
                  )}
                </div>
              );
            })}
          </div>
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
              Playlist
            </span>
            <span
              style={{
                fontSize: 56,
                fontWeight: 700,
                lineHeight: 1.05,
                letterSpacing: -1,
              }}
            >
              {clamp(data.title, 90)}
            </span>
            {data.creator && (
              <span
                style={{
                  fontSize: 26,
                  color: "#d4d4d4",
                  marginTop: 4,
                }}
              >
                by {clamp(data.creator, 60)}
              </span>
            )}
            <span
              style={{ fontSize: 22, color: "#a3a3a3", marginTop: 8 }}
            >
              {trackLabel}
            </span>
          </div>
          <OgBrand />
        </div>
      </div>
    ),
    size,
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
