import "server-only";

/**
 * MusicBrainz OAuth refresh-token helper.
 *
 * MB's access tokens last ~1 hour. Without refresh, users get
 * bounced through OAuth every hour to keep voting / writing —
 * `auth.ts`'s jwt callback uses this on every request to keep the
 * session cookie fresh, and write routes that need to USE the
 * access token within the same request call it inline (the jwt
 * callback's refresh only updates the response cookie; the request
 * cookie this handler reads is still pre-refresh state on the
 * first request after expiry).
 *
 * Returns `null` when no refresh is needed (token still has more
 * than `skewMs` of life left). Returns `{ ok: false }` when MB
 * rejected the refresh — caller should treat the existing token as
 * invalid and prompt re-auth.
 */

const MB_TOKEN_ENDPOINT = "https://musicbrainz.org/oauth2/token";

export interface MbTokenSnapshot {
  accessToken: string | null | undefined;
  refreshToken: string | null | undefined;
  /** Unix ms — absolute expiry of `accessToken`. */
  expiresAt: number | null | undefined;
}

export type RefreshOutcome =
  | { ok: true; refreshed: false; snapshot: MbTokenSnapshot }
  | {
      ok: true;
      refreshed: true;
      snapshot: {
        accessToken: string;
        refreshToken: string | null;
        expiresAt: number;
      };
    }
  | { ok: false; reason: "no_refresh_token" | "refresh_failed" };

export async function maybeRefreshMbToken(
  input: MbTokenSnapshot,
  opts: { skewMs?: number } = {},
): Promise<RefreshOutcome> {
  const skew = opts.skewMs ?? 5 * 60 * 1000;
  const expiresAt = typeof input.expiresAt === "number" ? input.expiresAt : null;
  // Unknown expiry → assume fresh. (Initial sign-in always sets this,
  // so an unset `expiresAt` only happens for tokens minted before the
  // refresh fields were introduced. We treat them as valid and let MB
  // 401 us if they're actually dead.)
  if (expiresAt === null) {
    return { ok: true, refreshed: false, snapshot: input };
  }
  if (Date.now() < expiresAt - skew) {
    return { ok: true, refreshed: false, snapshot: input };
  }
  if (typeof input.refreshToken !== "string") {
    return { ok: false, reason: "no_refresh_token" };
  }
  try {
    const res = await fetch(MB_TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: input.refreshToken,
        client_id: process.env.AUTH_MUSICBRAINZ_ID ?? "",
        client_secret: process.env.AUTH_MUSICBRAINZ_SECRET ?? "",
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      return { ok: false, reason: "refresh_failed" };
    }
    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (typeof data.access_token !== "string") {
      return { ok: false, reason: "refresh_failed" };
    }
    return {
      ok: true,
      refreshed: true,
      snapshot: {
        accessToken: data.access_token,
        refreshToken:
          typeof data.refresh_token === "string"
            ? data.refresh_token
            : (input.refreshToken ?? null),
        expiresAt:
          typeof data.expires_in === "number"
            ? Date.now() + data.expires_in * 1000
            : Date.now() + 60 * 60 * 1000,
      },
    };
  } catch {
    // Network failure on the refresh — keep the existing token,
    // caller can retry on the next request. Don't mark as
    // refresh_failed because that signals a non-transient state.
    return { ok: true, refreshed: false, snapshot: input };
  }
}
