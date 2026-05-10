import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { dicebearShapesUrl } from "@/lib/dicebear-shapes";

interface UserAvatarProps {
  username: string;
  /**
   * Real uploaded avatar URL — when present, renders this instead of
   * the DiceBear-generated SVG. Currently sourced from a linked
   * Bluesky profile (see `getBskyDisplayProfile`).
   */
  imageUrl?: string | null;
  /** Tailwind sizing class applied to the wrapper (e.g. "size-9"). */
  className?: string;
  fallbackClassName?: string;
}

/**
 * Avatar wrapper that prefers an uploaded image when one's available
 * and falls back to a deterministic DiceBear-generated SVG keyed off
 * the username.
 *
 * When `imageUrl` is supplied (typically a remote URL like
 * `cdn.bsky.app/...`), we render a plain `<img>` rather than going
 * through Base UI's `AvatarImage`. Base UI's component preflight-
 * checks the load via a hidden `new Image()` that *does* set
 * `referrerPolicy="no-referrer"`, but it strips that prop off the
 * actually-rendered `<img>` — so the displayed image silently leaks
 * `Referer` and CDNs that gate on referrer (notably Bluesky's) serve
 * a 403. By rendering the override directly we keep `referrerPolicy`
 * on the live element.
 *
 * The DiceBear default still flows through Base UI's machinery
 * because it's same-origin-friendly and benefits from Base UI's
 * fade-in animation.
 */
export function UserAvatar({
  username,
  imageUrl,
  className,
  fallbackClassName,
}: UserAvatarProps) {
  const initial = username.slice(0, 1).toUpperCase();
  return (
    <Avatar className={className}>
      {imageUrl ? (
        // Plain-<img> override path: skip AvatarImage + AvatarFallback
        // entirely. Base UI's AvatarFallback only hides when
        // AvatarImage reports a 'loaded' status — bypassing
        // AvatarImage means the fallback would otherwise render
        // alongside the override and produce a visible "J" beside
        // the photo. The img's alt text is the worst-case fallback
        // if it fails to load.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={username}
          referrerPolicy="no-referrer"
          loading="lazy"
          className="aspect-square size-full rounded-full object-cover"
        />
      ) : (
        <>
          <AvatarImage src={dicebearShapesUrl(username)} alt={username} />
          <AvatarFallback className={fallbackClassName}>
            {initial}
          </AvatarFallback>
        </>
      )}
    </Avatar>
  );
}
