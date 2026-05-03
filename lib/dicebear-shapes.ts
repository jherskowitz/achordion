/**
 * Deterministic DiceBear `shapes` URL builder pinned to a calm,
 * editorial palette: deep slates + warm earth tones + cool greens.
 *
 * Why this palette: Achordion's UI is largely monochrome with a single
 * accent — Parachord brand purple (`#8b5cf6`) used on the running-state
 * Play buttons. If avatars also lived in the violet family they'd
 * compete with the play CTAs and pull the eye away from the primary
 * action. Picking from a non-violet palette keeps avatars visually
 * "in the family" of the site without fighting the accent.
 *
 * DiceBear picks one entry from each comma-separated list
 * deterministically by seed, so each avatar is varied and stable
 * across renders, but always sits inside this curated set.
 */

// Backgrounds: a mix of dark slates, soft off-whites, deep teals,
// warm clays, and a deep ink-blue. Roughly even split between dark
// and light so seed variety isn't biased toward one tone.
const BG_COLORS = [
  "0f172a", // slate 900 — near-black ink
  "1e293b", // slate 800
  "334155", // slate 700
  "e2e8f0", // slate 200 — paper
  "f8fafc", // slate 50  — paper highlight
  "065f46", // emerald 800 — deep forest
  "0f766e", // teal 700
  "7c2d12", // clay-red 800 — terracotta
  "92400e", // amber 800 — ochre
  "1e3a8a", // blue 900 — ink blue
].join(",");

// Shape fills picked for high contrast against any of the backgrounds
// above. White and near-black anchor the legibility; warm gold and
// clay add a hand-printed, editorial feel without leaning purple.
const SHAPE_COLORS = [
  "f8fafc", // paper white
  "0f172a", // ink black
  "fbbf24", // amber 400 — warm gold accent
  "7c2d12", // clay-red — same as one bg, intentional for tonal echos
  "94a3b8", // slate 400 — quiet neutral
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
