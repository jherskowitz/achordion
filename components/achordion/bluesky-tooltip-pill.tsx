"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Props {
  handle: string;
  displayName?: string | null;
}

/**
 * Bluesky butterfly logo. Inline SVG so we don't depend on a remote
 * favicon (Google's s2 service caches a stale glyph for bsky.app)
 * and so the icon inherits text colour for tinting via Tailwind.
 *
 * Path lifted from Bluesky's public brand assets (Logo_Notext.svg).
 */
function BlueskyLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 600 530"
      role="img"
      aria-hidden="true"
      className={className}
      fill="currentColor"
    >
      <path d="M135.72 44.03C202.216 93.951 273.74 195.17 300 249.49c26.262-54.316 97.782-155.54 164.28-205.46C512.26 8.009 590-19.862 590 68.825c0 17.712-10.155 148.79-16.111 170.07-20.703 73.984-96.144 92.854-163.25 81.433 117.3 19.964 147.14 86.092 82.697 152.22-122.39 125.59-175.91-31.511-189.63-71.766-2.514-7.38-3.69-10.832-3.708-7.896-.017-2.936-1.193.516-3.707 7.896-13.714 40.255-67.233 197.36-189.63 71.766-64.444-66.128-34.605-132.26 82.697-152.22-67.108 11.421-142.55-7.45-163.25-81.433C20.156 217.61 10 86.537 10 68.825c0-88.687 77.742-60.816 125.72-24.795Z" />
    </svg>
  );
}

/**
 * Compact Bluesky favicon-link with the linked Bluesky handle in a
 * custom tooltip. Used on profile pages alongside the rendered bio
 * — the favicon is the affordance, the handle is the disclosure.
 */
export function BlueskyTooltipPill({ handle, displayName }: Props) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={`https://bsky.app/profile/${handle}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Bluesky · @${handle}`}
          className="border-border/60 bg-card/30 hover:bg-card/60 text-foreground/80 hover:text-foreground inline-flex size-7 shrink-0 items-center justify-center rounded-full border transition-colors"
        >
          <BlueskyLogo className="size-3.5" />
        </a>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start">
        <div className="text-left">
          {displayName && (
            <div className="font-semibold">{displayName}</div>
          )}
          <div className="text-background/70">@{handle} · Bluesky</div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
