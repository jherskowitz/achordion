import { cn } from "@/lib/utils";

/**
 * The Achordion wordmark as an inline SVG.
 *
 * Light/dark handling: the dark portions use `currentColor`, so the
 * mark inherits whatever `text-foreground` resolves to (near-black in
 * light mode, near-white in dark). The two purple accent rectangles
 * stay branded — `#774BE9` reads fine on both backgrounds.
 *
 * Sizing: the parent should set width or font-size; the SVG itself
 * carries the aspect ratio (918:177). The default `h-5` lines up with
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
      viewBox="0 0 918 177"
      role="img"
      aria-label={ariaLabel}
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-5 w-auto", className)}
    >
      <path
        d="M399 65.5C423.506 65.5 444.5 86.5754 444.5 114C444.5 141.425 423.506 162.5 399 162.5C374.494 162.5 353.5 141.425 353.5 114C353.5 86.5754 374.494 65.5 399 65.5Z"
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
      <path d="M653 55H680V69H653V55Z" fill="#774BE9" />
      <path d="M648 51H685V56H648V51Z" fill="#774BE9" />
      <rect x="462" y="115" width="27" height="60" fill="currentColor" />
      <path
        d="M462 115C462 80.2061 488.191 52 520.5 52C520.667 52 520.833 52.0024 521 52.0039L521 79.0078C520.833 79.0046 520.667 79 520.5 79C505.195 79 489.499 92.7582 489.012 113.983L489 115L462 115Z"
        fill="currentColor"
      />
      <rect x="311" y="114" width="25" height="60" fill="currentColor" />
      <rect x="232" y="8" width="25" height="166" fill="currentColor" />
      <path d="M257 0V12.5L232 7.87793L257 0Z" fill="currentColor" />
      <path
        d="M283.702 58C310.533 58 333.054 84.2707 335.898 118H310.816C308.171 93.7637 292.459 83 283.702 83C275.176 83 259.661 93.5035 257.075 118H232C234.787 84.2707 256.871 58 283.702 58Z"
        fill="currentColor"
      />
      <path
        d="M181.452 53.0049C199.831 53.2468 216.208 62.1205 227 75.9023L203.09 89.5439C197.09 83.5401 189.067 80.0001 180.681 80C163.593 80 148 94.6905 148 115C148 135.31 163.593 150 180.681 150C188.463 150 195.933 146.952 201.764 141.715L225.886 155.478C214.942 168.657 198.75 177 180.681 177L179.909 176.995C147.304 176.566 121 148.974 121 115C121 80.7583 147.72 53 180.681 53L181.452 53.0049Z"
        fill="currentColor"
      />
      <path
        d="M892 122L917.187 122.3L917.186 174.8H892V122Z"
        fill="currentColor"
      />
      <path d="M813 62.563L838 50V174H813V62.563Z" fill="currentColor" />
      <path
        d="M864.702 59.5C891.605 59.5 914.175 87.4522 916.921 123.287H891.819C890.615 111.731 886.66 102.005 881.632 95.2168C875.532 86.9803 869.21 84.5 864.702 84.5C860.257 84.5001 854.092 86.9144 848.116 95.0898C843.164 101.866 839.256 111.63 838.073 123.287H812.978C815.668 87.4523 837.799 59.5002 864.702 59.5Z"
        fill="currentColor"
      />
      <path
        d="M613.35 115.65V11.7266L613.776 11.5703L638.776 2.38966L639.65 2.06934V115.65H613.35Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.3"
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
