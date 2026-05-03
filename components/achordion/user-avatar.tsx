import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { dicebearShapesUrl } from "@/lib/dicebear-shapes";

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
 * username, using Achordion's Parachord-aligned palette. The shadcn
 * AvatarFallback (initial) shows briefly during the SVG load and as a
 * final fallback if DiceBear is unreachable.
 */
export function UserAvatar({
  username,
  imageUrl,
  className,
  fallbackClassName,
}: UserAvatarProps) {
  const src = imageUrl ?? dicebearShapesUrl(username);
  const initial = username.slice(0, 1).toUpperCase();
  return (
    <Avatar className={className}>
      <AvatarImage src={src} alt={username} />
      <AvatarFallback className={fallbackClassName}>{initial}</AvatarFallback>
    </Avatar>
  );
}
