/**
 * LB Radio "mode" axis — shared between the server-rendered radio
 * builder page (which reads `?mode=` from the URL and renders preset
 * chips) and the client-side <RadioModeSlider> component.
 *
 * Lives here as a plain module rather than inside the slider file
 * because Next's RSC rules tag every export of a `"use client"`
 * module as client-only — so even pure helpers like `modeLabel`
 * become un-callable from server components if they live next to
 * client React. This matches the `lib/familiarity.ts` split.
 *
 * Wire-format mode tokens ("easy" / "medium" / "hard") are
 * unchanged — that's what the LB Radio API speaks. The user-facing
 * labels are the new "Narrow / Standard / Wide" radius vocabulary.
 */

export type RadioMode = "easy" | "medium" | "hard";

export interface RadioModeStep {
  /** Slider position 0/50/100. */
  value: number;
  /** Wire-format mode passed to the LB Radio API. */
  mode: RadioMode;
  /** User-facing label. */
  label: string;
  /** Short helper text describing what the mode does. */
  blurb: string;
}

export const RADIO_MODE_STEPS: readonly RadioModeStep[] = [
  {
    value: 0,
    mode: "easy",
    label: "Narrow",
    blurb: "Stay close — tracks similar to the seed.",
  },
  {
    value: 50,
    mode: "medium",
    label: "Standard",
    blurb: "Mix it up — adjacent artists and styles.",
  },
  {
    value: 100,
    mode: "hard",
    label: "Wide",
    blurb: "Wide net — bigger jumps from the seed.",
  },
] as const;

export function valueFromMode(m: RadioMode): number {
  return RADIO_MODE_STEPS.find((s) => s.mode === m)?.value ?? 0;
}

export function stepFromValue(v: number): RadioModeStep {
  // Snap to the closest of 0/50/100. The slider's `step={50}` already
  // does this on the input side; the lookup is just to map the
  // resulting value back onto a step record.
  return RADIO_MODE_STEPS.reduce((best, s) =>
    Math.abs(s.value - v) < Math.abs(best.value - v) ? s : best,
  );
}

export function modeLabel(mode: RadioMode): string {
  return RADIO_MODE_STEPS.find((s) => s.mode === mode)?.label ?? mode;
}
