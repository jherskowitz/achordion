import { auth } from "@/auth";
import { getListenerFingerprint } from "@/lib/listener-fingerprint";
import { isFeatureEnabled } from "@/lib/flags";
import { ListenerFingerprintInteractive } from "./listener-fingerprint-interactive";

/**
 * Listener-fingerprint server wrapper.
 *
 * Fetches the data + flag-checks, then hands off to the client
 * island for the interactive render (hover-zoom, deep-link on
 * click, inner-hole hovered-artist label).
 *
 * Two layout sizes: `lg` for the profile header (default; ~140px)
 * and `sm` for inline use on user cards / list rows (~48px).
 *
 * Gates on the `listener-fingerprint` feature flag scoped to the
 * viewer — separate from `listener-bio` and `listener-archetypes`
 * so each "computed identity" surface rolls out independently.
 *
 * Returns null on:
 *   - viewer's flag is off,
 *   - profile owner has too few top artists to make a meaningful
 *     glyph (<6 — the helper returns null), or
 *   - LB stats endpoint is unreachable.
 */
export async function ListenerFingerprint({
  name,
  size = "lg",
}: {
  name: string;
  size?: "lg" | "sm";
}) {
  const session = await auth();
  const viewer = session?.user?.mbUsername ?? null;
  if (!(await isFeatureEnabled("listener-fingerprint", viewer))) return null;

  const data = await getListenerFingerprint(name);
  if (!data) return null;

  const dim = size === "lg" ? 140 : 48;
  return <ListenerFingerprintInteractive data={data} dim={dim} />;
}
