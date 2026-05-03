import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

/**
 * DiceBear style — `shapes` gives abstract geometric avatars that look
 * deliberate rather than auto-generated. Stable per seed, so the same
 * username always renders the same shapes/colours across renders. Easy
 * to swap to a different style if the visual mix changes.
 */
const DICEBEAR_BASE = "https://api.dicebear.com/9.x/shapes/svg";

function generatedAvatarUrl(username: string): string {
  return `${DICEBEAR_BASE}?seed=${encodeURIComponent(username.toLowerCase())}`;
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
