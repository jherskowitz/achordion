/**
 * Pick a readable foreground colour for the Spinbin brand tile so
 * light / medium hues (e.g. WPRB orange) get black text instead of
 * white. Quick perceptual luminance check — close enough for a
 * two-colour decision. Shared between the grid card and the
 * rewind detail-page hero.
 */
export function tileTextColor(hex: string): string {
  const m = hex.match(/^#?([a-f0-9]{6})$/i);
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  // ITU-R BT.601 luma — fast, readable.
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma > 0.62 ? "#111111" : "#ffffff";
}
