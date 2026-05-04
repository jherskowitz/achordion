/**
 * Deterministic DiceBear `shapes` URL builder pinned to the Parachord
 * sidebar palette — the saturated per-section colors used to highlight
 * the active nav label in the Parachord desktop app (Home / Playlists /
 * Library / History / New Releases / Recommendations / Discover /
 * Critical Darlings / Concerts).
 *
 * Using the same palette here keeps Achordion and Parachord tonally
 * linked: when a user has both apps open, the avatar colors on
 * Achordion echo the sidebar accents they see in Parachord, reinforcing
 * the "two halves of one product" framing without making either feel
 * like a recolor of the other.
 *
 * DiceBear picks one entry from each comma-separated list
 * deterministically by seed, so each avatar is varied and stable
 * across renders, but always sits inside this curated set.
 */

// Backgrounds: the nine Parachord sidebar accent colors.
const BG_COLORS = [
  "7c3aed", // violet 600  — Home
  "ec4899", // pink 500    — Playlists
  "06b6d4", // cyan 500    — Library
  "3b82f6", // blue 500    — History
  "10b981", // emerald 500 — New Releases
  "f59e0b", // amber 500   — Recommendations
  "f97316", // orange 500  — Discover / Pop of the Tops
  "ef4444", // red 500     — Critical Darlings
  "10c9b4", // teal        — Concerts
].join(",");

// Shape fills: white and near-black anchor legibility against any of
// the saturated backgrounds above; the soft paper tone adds tonal
// variety without introducing a third hue.
const SHAPE_COLORS = [
  "f8fafc", // paper white
  "0f172a", // ink black
  "e2e8f0", // soft paper
].join(",");

const DICEBEAR_BASE = "https://api.dicebear.com/9.x/shapes/svg";

export function dicebearShapesUrl(seed: string): string {
  const params = new URLSearchParams({
    seed: seed.toLowerCase(),
    backgroundColor: BG_COLORS,
    shape1Color: SHAPE_COLORS,
    shape2Color: SHAPE_COLORS,
    shape3Color: SHAPE_COLORS,
  });
  return `${DICEBEAR_BASE}?${params}`;
}
