/**
 * Shared brand footer for OG cards.
 *
 * Renders the Achordion wordmark stacked above the "People-powered
 * music discovery" tagline. Used by every entity OG image
 * (`/artist/...`, `/release-group/...`, `/recording/...`,
 * `/playlist/...`, `/user/...`).
 *
 * Satori (next/og) constraints baked in:
 *   - inline SVG only; no <img> for the wordmark (works but the
 *     vector inlines render crisper at OG resolutions).
 *   - No `currentColor` — satori doesn't resolve color inheritance
 *     into SVG fills the way browsers do; explicit `fill="#fafafa"`
 *     and `fill="#774BE9"` are required.
 *   - No CSS variables — `var(--achordion-brand)` works in the
 *     browser but satori treats it as opaque text. Hardcoded the
 *     accent hex to match.
 *   - Single root element passed to ImageResponse JSX, so this is
 *     a fragment-free <div> column.
 */

interface BrandProps {
  /** Tagline tone; default muted grey suits the dark OG background. */
  tone?: "default" | "muted";
}

export function OgBrand({ tone = "default" }: BrandProps) {
  const taglineColor = tone === "muted" ? "#737373" : "#a3a3a3";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {/* Inline wordmark — paths lifted verbatim from
          components/layout/wordmark-mark.tsx; satori needs every
          fill spelled out (no currentColor, no CSS vars). The two
          purple accents on top of the 'i' stay the brand hex. */}
      <svg
        viewBox="0 0 919 174"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        width={228}
        height={43}
      >
        <path
          d="M399 63.5C423.506 63.5 444.5 84.5754 444.5 112C444.5 139.425 423.506 160.5 399 160.5C374.494 160.5 353.5 139.425 353.5 112C353.5 84.5754 374.494 63.5 399 63.5Z"
          stroke="#fafafa"
          strokeWidth="27"
        />
        <path
          d="M748.5 64.5C772.725 64.5 793.5 85.3462 793.5 112.5C793.5 139.654 772.725 160.5 748.5 160.5C724.275 160.5 703.5 139.654 703.5 112.5C703.5 85.3462 724.275 64.5 748.5 64.5Z"
          stroke="#fafafa"
          strokeWidth="27"
        />
        <path
          d="M58.5 64.5C82.7246 64.5 103.5 85.3462 103.5 112.5C103.5 139.654 82.7246 160.5 58.5 160.5C34.2754 160.5 13.5 139.654 13.5 112.5C13.5 85.3462 34.2754 64.5 58.5 64.5Z"
          stroke="#fafafa"
          strokeWidth="27"
        />
        <rect
          x="92.5"
          y="51.5"
          width="24"
          height="122"
          fill="#fafafa"
          stroke="#fafafa"
        />
        <rect x="653" y="74" width="27" height="100" fill="#fafafa" />
        <path d="M653 54H680V68H653V54Z" fill="#774BE9" />
        <path d="M648 50H685V55H648V50Z" fill="#774BE9" />
        <rect x="462" y="113" width="27" height="60" fill="#fafafa" />
        <path
          d="M462 113C462 78.2061 488.191 50 520.5 50C520.667 50 520.833 50.0024 521 50.0039L521 77.0078C520.833 77.0046 520.667 77 520.5 77C505.195 77 489.499 90.7582 489.012 111.983L489 113L462 113Z"
          fill="#fafafa"
        />
        <path d="M311 114L336 118V174H311V114Z" fill="#fafafa" />
        <rect x="232" y="8" width="25" height="166" fill="#fafafa" />
        <path d="M257 0V12.5L232 7.87793L257 0Z" fill="#fafafa" />
        <path
          d="M283.702 58C310.533 58 333.054 84.2707 335.898 118H310.816C308.171 93.7637 292.459 83 283.702 83C275.176 83 259.661 93.5035 257.075 118H232C234.787 84.2707 256.871 58 283.702 58Z"
          fill="#fafafa"
        />
        <path
          d="M181.452 50.0049C199.831 50.2468 216.208 59.1205 227 72.9023L203.09 86.5439C197.09 80.5401 189.067 77.0001 180.681 77C163.593 77 148 91.6905 148 112C148 132.31 163.593 147 180.681 147C188.463 147 195.933 143.952 201.764 138.715L225.886 152.478C214.942 165.657 198.75 174 180.681 174L179.909 173.995C147.304 173.566 121 145.974 121 112C121 77.7583 147.72 50 180.681 50L181.452 50.0049Z"
          fill="#fafafa"
        />
        <path
          d="M917.5 172.5H891.5V112.479L892.021 112.5L917.021 113.518L917.5 113.537V172.5Z"
          fill="#fafafa"
          stroke="#fafafa"
        />
        <path
          d="M838.5 172.5H812.5V60.2549L812.775 60.1162L837.775 47.5537L838.5 47.1895V172.5Z"
          fill="#fafafa"
          stroke="#fafafa"
        />
        <path
          d="M864.725 50C891.628 50 914.197 77.9522 916.943 113.787H891.842C890.637 102.231 886.682 92.5053 881.654 85.7168C875.554 77.4803 869.233 75 864.725 75C860.279 75.0001 854.114 77.4144 848.139 85.5898C843.186 92.3655 839.278 102.13 838.096 113.787H813C815.691 77.9523 837.822 50.0002 864.725 50Z"
          fill="#fafafa"
          stroke="#fafafa"
          strokeWidth="2"
        />
        <path d="M639 114H614V11.1803L639 2V114Z" fill="#fafafa" />
        <path
          d="M580 63.5C604.506 63.5 625.5 84.5754 625.5 112C625.5 139.425 604.506 160.5 580 160.5C555.494 160.5 534.5 139.425 534.5 112C534.5 84.5754 555.494 63.5 580 63.5Z"
          stroke="#fafafa"
          strokeWidth="27"
        />
      </svg>
      <span
        style={{
          fontSize: 20,
          color: taglineColor,
          letterSpacing: 0.2,
        }}
      >
        People-powered music discovery
      </span>
    </div>
  );
}
