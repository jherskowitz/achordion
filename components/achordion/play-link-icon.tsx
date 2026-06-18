import type { SVGProps } from "react";

/**
 * Play-link glyph: a play-triangle keyline with an external-link arrow
 * leaving the top-right. Triggers the streaming "play links" flyout on
 * track rows — reads as "play this somewhere else" better than the
 * generic external-link square. Lucide-style stroke conventions
 * (currentColor, 2px round stroke, 24 viewBox) so it sits flush beside
 * the lucide icons next to it; size via the `size-*` className.
 */
export function PlayLinkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {/* play triangle (keyline), pointing right */}
      <path d="M4 6v12l10-6z" />
      {/* external-link arrow, leaving the top-right */}
      <path d="M15 5h4v4" />
      <path d="M19 5l-5 5" />
    </svg>
  );
}
