/**
 * Apple Music charts country list — same set Parachord exposes in its
 * Charts page. Codes are ISO 3166-1 alpha-2 lowercase, which is what
 * Apple's `rss.marketingtools.apple.com` JSON feed expects in the URL
 * path.
 */

export interface ChartsCountry {
  code: string;
  name: string;
  /** Country flag emoji for the picker — purely decorative. */
  flag: string;
}

export const CHARTS_COUNTRIES: ChartsCountry[] = [
  { code: "us", name: "United States", flag: "🇺🇸" },
  { code: "gb", name: "United Kingdom", flag: "🇬🇧" },
  { code: "ca", name: "Canada", flag: "🇨🇦" },
  { code: "au", name: "Australia", flag: "🇦🇺" },
  { code: "de", name: "Germany", flag: "🇩🇪" },
  { code: "fr", name: "France", flag: "🇫🇷" },
  { code: "jp", name: "Japan", flag: "🇯🇵" },
  { code: "kr", name: "South Korea", flag: "🇰🇷" },
  { code: "br", name: "Brazil", flag: "🇧🇷" },
  { code: "mx", name: "Mexico", flag: "🇲🇽" },
  { code: "es", name: "Spain", flag: "🇪🇸" },
  { code: "it", name: "Italy", flag: "🇮🇹" },
  { code: "nl", name: "Netherlands", flag: "🇳🇱" },
  { code: "se", name: "Sweden", flag: "🇸🇪" },
  { code: "pl", name: "Poland", flag: "🇵🇱" },
];

export function getChartsCountry(code: string): ChartsCountry | null {
  return CHARTS_COUNTRIES.find((c) => c.code === code) ?? null;
}
