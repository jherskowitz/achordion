import "server-only";

import { z } from "zod";

/**
 * CritiqueBrainz OAuth2 helpers — separate from MusicBrainz OAuth
 * because, despite both being MetaBrainz, CritiqueBrainz runs its own
 * OAuth provider with its own client registration. We don't add this
 * as a second Auth.js provider (Auth.js v5 with JWT-only strategy
 * doesn't cleanly support account linking); instead, the user signs
 * in via MB OAuth as usual, then performs a one-time "Connect
 * CritiqueBrainz" flow whose access token lands in an encrypted
 * `cb-token` cookie via the routes under `app/api/critiquebrainz/`.
 *
 * Register an app at https://critiquebrainz.org/oauth/client/list and
 * set:
 *   AUTH_CRITIQUEBRAINZ_ID
 *   AUTH_CRITIQUEBRAINZ_SECRET
 *
 * Redirect URI for local dev:
 *   http://localhost:3000/api/critiquebrainz/callback
 */

export const CB_OAUTH_AUTHORIZE = "https://critiquebrainz.org/oauth/authorize";
export const CB_OAUTH_TOKEN = "https://critiquebrainz.org/ws/1/oauth/token";

/** `review` is the only scope we need for first cut — read uses no
 *  auth at all. Add `vote` later if we want to support upvotes. */
export const CB_OAUTH_SCOPE = "review";

const TokenResponseSchema = z
  .object({
    access_token: z.string(),
    token_type: z.string().optional(),
    expires_in: z.number().optional(),
    refresh_token: z.string().optional(),
    scope: z.string().optional(),
  })
  .passthrough();

export interface CbTokenBundle {
  accessToken: string;
  refreshToken: string | null;
  /** Unix epoch milliseconds when the access token expires, or null
   *  when the server didn't return `expires_in`. */
  expiresAt: number | null;
}

export function buildAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    scope: CB_OAUTH_SCOPE,
    state: opts.state,
  });
  return `${CB_OAUTH_AUTHORIZE}?${params.toString()}`;
}

export async function exchangeCode(opts: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}): Promise<CbTokenBundle> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: opts.code,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    redirect_uri: opts.redirectUri,
  });
  const res = await fetch(CB_OAUTH_TOKEN, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `CritiqueBrainz token exchange failed: ${res.status} ${res.statusText}`,
    );
  }
  const data = TokenResponseSchema.parse(await res.json());
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt:
      typeof data.expires_in === "number"
        ? Date.now() + data.expires_in * 1000
        : null,
  };
}
