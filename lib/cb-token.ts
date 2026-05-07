import "server-only";

import { cookies } from "next/headers";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import type { CbTokenBundle } from "@/lib/auth/critiquebrainz";

/**
 * CritiqueBrainz OAuth tokens, encrypted at rest in an httpOnly
 * cookie. Mirrors the AES-256-GCM scheme used for `lb-token.ts` —
 * see that file for the rationale on the key-derivation choice.
 *
 * Stored as a JSON-encoded `CbTokenBundle` ({access, refresh,
 * expiresAt}) inside the same envelope so we can recover from
 * the access token expiring without a fresh OAuth round-trip.
 */

const COOKIE_NAME = "achordion_cb_token";
const STATE_COOKIE_NAME = "achordion_cb_oauth_state";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function deriveKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET must be set to encrypt cookies at rest");
  }
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
    return null;
  }
}

export async function setCbTokensCookie(tokens: CbTokenBundle): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_NAME, encrypt(JSON.stringify(tokens)), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function clearCbTokensCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function getCbTokens(): Promise<CbTokenBundle | null> {
  const jar = await cookies();
  const value = jar.get(COOKIE_NAME)?.value;
  if (!value) return null;
  const json = decrypt(value);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as CbTokenBundle;
    if (typeof parsed?.accessToken !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Quick boolean for UI state — does the viewer have a CB token at all? */
export async function hasCbConnection(): Promise<boolean> {
  const tokens = await getCbTokens();
  if (!tokens) return false;
  if (tokens.expiresAt && tokens.expiresAt < Date.now()) return false;
  return true;
}

// ─── OAuth state cookie (CSRF protection during the round trip) ────

export async function setCbStateCookie(state: string): Promise<void> {
  const jar = await cookies();
  jar.set(STATE_COOKIE_NAME, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 5,
  });
}

export async function consumeCbStateCookie(): Promise<string | null> {
  const jar = await cookies();
  const value = jar.get(STATE_COOKIE_NAME)?.value ?? null;
  jar.delete(STATE_COOKIE_NAME);
  return value;
}
