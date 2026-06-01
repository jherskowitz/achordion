import "server-only";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

import { cookies } from "next/headers";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const COOKIE_NAME = "achordion_lb_token";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function deriveKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET must be set to encrypt cookies at rest");
  }
  // SHA-256 of the auth secret gives us a 32-byte AES-256 key. The secret
  // itself is high-entropy (generated via `npx auth secret` or openssl
  // rand) so a single hash round is fine — we're not stretching a low-
  // entropy password.
  return createHash("sha256").update(secret).digest();
}

function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(), iv);
  const ct = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ct, tag]).toString("base64url");
}

function decrypt(payload: string): string | null {
  try {
    const buf = Buffer.from(payload, "base64url");
    if (buf.length < IV_BYTES + TAG_BYTES) return null;
    const iv = buf.subarray(0, IV_BYTES);
    const tag = buf.subarray(buf.length - TAG_BYTES);
    const ct = buf.subarray(IV_BYTES, buf.length - TAG_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString(
      "utf8",
    );
  } catch {
    // Wrong key, tampered payload, or legacy plaintext cookie from before
    // encryption was added — treat as no-token. The user will re-paste.
    return null;
  }
}

export async function setLbTokenCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_NAME, encrypt(token), {
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

async function readUserToken(): Promise<string | null> {
  const jar = await cookies();
  const value = jar.get(COOKIE_NAME)?.value;
  if (!value) return null;
  return decrypt(value);
}

/**
 * Returns the signed-in user's pasted ListenBrainz token, or the server's
 * env-configured fallback. User-pasted token wins when both exist.
 */
export async function getLbTokenForRequest(): Promise<string | null> {
  const userToken = await readUserToken();
  if (userToken) return userToken;
  return process.env.LISTENBRAINZ_TOKEN ?? null;
}

/**
 * Just the user-pasted token, or null. Used by the settings UI to show
 * whether they have one configured (without leaking the value).
 */
export async function hasUserLbToken(): Promise<boolean> {
  const token = await readUserToken();
  return token !== null;
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
    const res = await fetchWithTimeout("https://api.listenbrainz.org/1/validate-token", {
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
