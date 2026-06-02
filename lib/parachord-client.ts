/**
 * Parachord client attribution for contribution endpoints.
 *
 * Parachord clients send an `X-Parachord-Client` header on
 * `POST /api/track-links/submit` identifying the contributing platform
 * (Parachord/parachord#851, parachord-plugins#4). We record it for
 * analytics / abuse triage / rollout monitoring.
 *
 * The header is CLIENT-CONTROLLED, so it is telemetry only — never
 * trust it for auth. Normalize against a fixed allowlist; anything off
 * the list (including absent/empty) collapses to `"unknown"`.
 */

export const PARACHORD_CLIENT_HEADER = "x-parachord-client";

export type ParachordClient = "desktop" | "android" | "ios" | "unknown";

const ALLOWED: ReadonlySet<ParachordClient> = new Set([
  "desktop",
  "android",
  "ios",
]);

export function normalizeParachordClient(
  raw: string | null | undefined,
): ParachordClient {
  const v = (raw ?? "").trim().toLowerCase();
  return ALLOWED.has(v as ParachordClient) ? (v as ParachordClient) : "unknown";
}
