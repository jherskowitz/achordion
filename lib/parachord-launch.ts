"use client";

/**
 * Parachord deep-link launcher.
 *
 * Why this exists: a plain `<a href="parachord://...">` works on every
 * desktop OS (macOS LaunchServices / Windows AppRegistration / xdg-
 * open all hand the URL to the registered Parachord build), but
 * Android Chrome silently refuses to navigate to non-http schemes
 * from a regular anchor click — the canonical Android pattern is an
 * `intent://` URL with a `package=` (or scheme-only) handler and an
 * optional `S.browser_fallback_url` that runs when no app claims it.
 *
 * Usage on a touch-or-mixed surface:
 *
 *   <a href={parachordUrl} onClick={launchParachord(parachordUrl, fallback)}>
 *     …
 *   </a>
 *
 * The handler preserves desktop behaviour (lets the anchor navigate
 * normally) and only intervenes on Android. iOS Safari handles
 * parachord:// fine via Universal Links / OS scheme registration, so
 * we leave it on the same code path as desktop.
 */

const FALLBACK_URL = "https://parachord.com";

/**
 * Build the click handler. Returns the inline handler to assign to
 * an anchor's `onClick` prop.
 *
 * @param parachordUrl — the canonical `parachord://...` URL the
 *   anchor is already pointing at on desktop.
 * @param fallbackUrl — optional override for the install/landing
 *   page Chrome navigates to when no Parachord app handles the
 *   intent. Defaults to https://parachord.com.
 */
export function launchParachord(
  parachordUrl: string,
  fallbackUrl: string = FALLBACK_URL,
) {
  return (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (typeof navigator === "undefined") return;
    if (!/Android/i.test(navigator.userAgent)) return;
    // Strip the scheme — Android `intent://...#Intent;scheme=...` form
    // takes the path/query in the URL and the scheme as a parameter.
    const path = parachordUrl.replace(/^parachord:\/\//, "");
    const intentUrl =
      `intent://${path}` +
      `#Intent;scheme=parachord;` +
      `S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};` +
      `end`;
    e.preventDefault();
    window.location.href = intentUrl;
  };
}
