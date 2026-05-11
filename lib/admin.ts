import "server-only";

import { auth } from "@/auth";

/**
 * Admin allowlist.
 *
 * Hardcoded to the site owner's MusicBrainz username. There's
 * exactly one admin today and the surface backs sensitive Redis
 * writes (feature flags + announcements); pinning the identity in
 * code means a leaked / misconfigured env var can't accidentally
 * widen access. If we ever genuinely have more than one admin,
 * widen this set in the same commit that grants the second person
 * access — that gives the diff visible review.
 *
 * Matching is case-insensitive against `session.user.mbUsername`.
 */
const ADMIN_USERNAMES = new Set<string>(["jherskowitz"]);

export function isAdminUsername(name: string | null | undefined): boolean {
  if (!name) return false;
  return ADMIN_USERNAMES.has(name.toLowerCase());
}

/**
 * Resolve `{ username, isAdmin }` for the current request. Use at
 * the top of any admin route / server action — returns null when no
 * one's signed in.
 */
export async function getAdminSession(): Promise<{
  username: string;
  isAdmin: boolean;
} | null> {
  const session = await auth();
  const username = session?.user?.mbUsername ?? null;
  if (!username) return null;
  return { username, isAdmin: isAdminUsername(username) };
}

/**
 * Throw-on-miss variant for server actions. Anonymous and non-admin
 * users both surface the same generic message — admin existence is
 * "what admin surface?"-level unadvertised.
 */
export async function requireAdmin(): Promise<{ username: string }> {
  const a = await getAdminSession();
  if (!a?.isAdmin) {
    throw new Error("Not authorized.");
  }
  return { username: a.username };
}
