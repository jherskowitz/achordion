import "server-only";

import { cookies } from "next/headers";

const COOKIE_NAME = "achordion_lb_token";

export async function setLbTokenCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function clearLbTokenCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

/**
 * Returns the signed-in user's pasted ListenBrainz token, or the server's
 * env-configured fallback. User-pasted token wins when both exist.
 */
export async function getLbTokenForRequest(): Promise<string | null> {
  const jar = await cookies();
  const userToken = jar.get(COOKIE_NAME)?.value;
  if (userToken) return userToken;
  return process.env.LISTENBRAINZ_TOKEN ?? null;
}

/**
 * Just the user-pasted token, or null. Used by the settings UI to show
 * whether they have one configured (without leaking the value).
 */
export async function hasUserLbToken(): Promise<boolean> {
  const jar = await cookies();
  return Boolean(jar.get(COOKIE_NAME)?.value);
}

/**
 * Validate a token against ListenBrainz. Returns the LB username it
 * authenticates as, or null if invalid.
 */
export async function validateLbToken(
  token: string,
): Promise<{ valid: true; userName: string } | { valid: false; reason: string }> {
  if (!token.trim()) return { valid: false, reason: "Token is empty." };
  try {
    const res = await fetch("https://api.listenbrainz.org/1/validate-token", {
      headers: {
        Authorization: `Token ${token.trim()}`,
        "User-Agent": "Achordion/0.1 (jherskow@gmail.com)",
        Accept: "application/json",
      },
      cache: "no-store",
    });
    const body = (await res.json().catch(() => null)) as
      | { valid?: boolean; user_name?: string; message?: string }
      | null;
    if (!res.ok || !body?.valid) {
      return {
        valid: false,
        reason: body?.message ?? `LB returned ${res.status}.`,
      };
    }
    return { valid: true, userName: body.user_name ?? "" };
  } catch (err) {
    return {
      valid: false,
      reason:
        err instanceof Error ? err.message : "Couldn't reach ListenBrainz.",
    };
  }
}
