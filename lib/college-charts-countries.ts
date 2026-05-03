/**
 * College / community-radio chart country list.
 *
 * Each country code maps to a different national feed:
 *   - `ca` → !earshot (https://www.earshot-online.com) — Canada's NCRA
 *
 * Only Canada is wired today. NACC (US, ex-CMJ) and others are coming
 * soon — when added, drop them in here and the country picker on the
 * charts page picks them up automatically.
 */

export interface CollegeChartsCountry {
  code: string;
  name: string;
  /** Country flag emoji for the picker — purely decorative. */
  flag: string;
  /** Short attribution shown in the page header below the H1. */
  source: string;
}

export const COLLEGE_CHARTS_COUNTRIES: CollegeChartsCountry[] = [
  {
    code: "ca",
    name: "Canada",
    flag: "🇨🇦",
    source: "!earshot weekly Top 50",
  },
];

export function getCollegeChartsCountry(
  code: string,
): CollegeChartsCountry | null {
  return COLLEGE_CHARTS_COUNTRIES.find((c) => c.code === code) ?? null;
}
