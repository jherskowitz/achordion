import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

/**
 * DiceBear style — `shapes` gives abstract geometric avatars that look
 * deliberate rather than auto-generated. Stable per seed, so the same
 * username always renders the same shapes/colours across renders.
 *
 * Palette is locked to Parachord's brand colours so avatars sit in the
 * same family as the rest of the design system:
 *  - Backgrounds cycle through a primary purple, a lighter purple, the
 *    accent surface, plus dark neutrals so dark-mode users get
 *    near-black backgrounds and light-mode users get the lavenders.
 *  - Shape fills cycle through deep purple, white, and mid neutrals so
 *    every combination has enough contrast against its background.
 *
 * DiceBear picks one entry from each comma-separated list deterministi-
 * cally by seed, so the look is varied but always Parachord-coloured.
 */
const DICEBEAR_BASE = "https://api.dicebear.com/9.x/shapes/svg";

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

function generatedAvatarUrl(username: string): string {
  const params = new URLSearchParams({
    seed: username.toLowerCase(),
    backgroundColor: BG_COLORS,
    shape1Color: SHAPE_COLORS,
    shape2Color: SHAPE_COLORS,
    shape3Color: SHAPE_COLORS,
  });
  return `${DICEBEAR_BASE}?${params}`;
}

interface UserAvatarProps {
  username: string;
  /**
   * Real uploaded avatar URL — when present, renders this instead of
   * the DiceBear-generated SVG. Phase 1 has no upload pipeline so this
   * is mostly future-proofing; pass `session.user.image` here when we
   * eventually wire it up.
   */
  imageUrl?: string | null;
  /** Tailwind sizing class applied to the wrapper (e.g. "size-9"). */
  className?: string;
  fallbackClassName?: string;
}

/**
 * Avatar wrapper that prefers an uploaded image when one's available
 * and falls back to a deterministic DiceBear-generated SVG keyed off the
 * username. The shadcn AvatarFallback (initial) shows briefly during the
 * SVG load and as a final fallback if DiceBear is unreachable.
 */
export function UserAvatar({
  username,
  imageUrl,
  className,
  fallbackClassName,
}: UserAvatarProps) {
  const src = imageUrl ?? generatedAvatarUrl(username);
  const initial = username.slice(0, 1).toUpperCase();
  return (
    <Avatar className={className}>
      <AvatarImage src={src} alt={username} />
      <AvatarFallback className={fallbackClassName}>{initial}</AvatarFallback>
    </Avatar>
  );
}
