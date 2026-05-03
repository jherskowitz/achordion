/**
 * Deterministic DiceBear `shapes` URL builder pinned to Parachord's
 * brand palette. Same colours used by both the user-avatar and
 * artist-avatar fallbacks so generated avatars look like one family.
 *
 * DiceBear picks one entry from each comma-separated list deterministi-
 * cally by seed, so the look is varied between seeds but always sits
 * inside the Parachord palette.
 */

const BG_COLORS = [
  "7c3aed", // Parachord primary purple
  "a78bfa", // dark-mode primary
  "ede9fe", // accent surface
  "c4b5fd", // mid lavender
  "1e1e1e", // dark bg
  "f3f4f6", // light inset
].join(",");

const SHAPE_COLORS = [
  "6d28d9", // primary hover (deep purple)
  "ffffff",
  "111827", // text-primary
  "9ca3af", // text-tertiary
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
