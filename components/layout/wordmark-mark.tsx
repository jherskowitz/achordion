import { cn } from "@/lib/utils";

/**
 * The Achordion wordmark as an inline SVG.
 *
 * Light/dark handling: the dark portions use `currentColor`, so the
 * mark inherits whatever `text-foreground` resolves to (near-black in
 * light mode, near-white in dark). The two purple accent rectangles
 * use the Achordion brand color (`var(--achordion-brand)`, `#774BE9`),
 * which reads fine on both backgrounds. See DESIGN.md § Color for
 * why this is the wordmark-only color and not used elsewhere.
 *
 * Sizing: the parent should set width or font-size; the SVG itself
 * carries the aspect ratio (919:175). The default `h-5` lines up with
 * the header's existing baseline.
 */
export function WordmarkMark({
  className,
  ariaLabel = "Achordion",
}: {
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <svg
      viewBox="0 0 919 175"
      role="img"
      aria-label={ariaLabel}
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-5 w-auto", className)}
    >
      <path
        d="M399 64.5C423.506 64.5 444.5 85.5754 444.5 113C444.5 140.425 423.506 161.5 399 161.5C374.494 161.5 353.5 140.425 353.5 113C353.5 85.5754 374.494 64.5 399 64.5Z"
        stroke="currentColor"
        strokeWidth="27"
        fill="none"
      />
      <path
        d="M748.5 65.5C772.725 65.5 793.5 86.3462 793.5 113.5C793.5 140.654 772.725 161.5 748.5 161.5C724.275 161.5 703.5 140.654 703.5 113.5C703.5 86.3462 724.275 65.5 748.5 65.5Z"
        stroke="currentColor"
        strokeWidth="27"
        fill="none"
      />
      <path
        d="M58.5 65.5C82.7246 65.5 103.5 86.3462 103.5 113.5C103.5 140.654 82.7246 161.5 58.5 161.5C34.2754 161.5 13.5 140.654 13.5 113.5C13.5 86.3462 34.2754 65.5 58.5 65.5Z"
        stroke="currentColor"
        strokeWidth="27"
        fill="none"
      />
      <rect
        x="92.5"
        y="52.5"
        width="24"
        height="122"
        fill="currentColor"
        stroke="currentColor"
      />
      <rect x="653" y="75" width="27" height="100" fill="currentColor" />
      <path
        d="M653 55H680V69H653V55Z"
        style={{ fill: "var(--achordion-brand)" }}
      />
      <path
        d="M648 51H685V56H648V51Z"
        style={{ fill: "var(--achordion-brand)" }}
      />
      <rect x="462" y="115" width="27" height="60" fill="currentColor" />
      <path
        d="M462 115C462 80.2061 488.191 52 520.5 52C520.667 52 520.833 52.0024 521 52.0039L521 79.0078C520.833 79.0046 520.667 79 520.5 79C505.195 79 489.499 92.7582 489.012 113.983L489 115L462 115Z"
        fill="currentColor"
      />
      <path
        d="M311 114L336 118V174H311V114Z"
        fill="currentColor"
      />
      <rect x="232" y="8" width="25" height="166" fill="currentColor" />
      <path d="M257 0V12.5L232 7.87793L257 0Z" fill="currentColor" />
      <path
        d="M283.702 58C310.533 58 333.054 84.2707 335.898 118H310.816C308.171 93.7637 292.459 83 283.702 83C275.176 83 259.661 93.5035 257.075 118H232C234.787 84.2707 256.871 58 283.702 58Z"
        fill="currentColor"
      />
      <path
        d="M181.452 51.0049C199.831 51.2468 216.208 60.1205 227 73.9023L203.09 87.5439C197.09 81.5401 189.067 78.0001 180.681 78C163.593 78 148 92.6905 148 113C148 133.31 163.593 148 180.681 148C188.463 148 195.933 144.952 201.764 139.715L225.886 153.478C214.942 166.657 198.75 175 180.681 175L179.909 174.995C147.304 174.566 121 146.974 121 113C121 78.7583 147.72 51 180.681 51L181.452 51.0049Z"
        fill="currentColor"
      />
      <path
        d="M917.5 174.5H891.5V114.479L892.021 114.5L917.021 115.518L917.5 115.537V174.5Z"
        fill="currentColor"
        stroke="currentColor"
      />
      <path
        d="M838.5 174.5H812.5V62.2549L812.775 62.1162L837.775 49.5537L838.5 49.1895V174.5Z"
        fill="currentColor"
        stroke="currentColor"
      />
      <path
        d="M864.725 52C891.628 52 914.197 79.9522 916.943 115.787H891.842C890.637 104.231 886.682 94.5053 881.654 87.7168C875.554 79.4803 869.233 77 864.725 77C860.279 77.0001 854.114 79.4144 848.139 87.5898C843.186 94.3655 839.278 104.13 838.096 115.787H813C815.691 79.9523 837.822 52.0002 864.725 52Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M639 115H614V12.1803L639 3V115Z"
        fill="currentColor"
      />
      <path
        d="M580 64.5C604.506 64.5 625.5 85.5754 625.5 113C625.5 140.425 604.506 161.5 580 161.5C555.494 161.5 534.5 140.425 534.5 113C534.5 85.5754 555.494 64.5 580 64.5Z"
        stroke="currentColor"
        strokeWidth="27"
        fill="none"
      />
    </svg>
  );
}
