import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      mbUsername?: string;
      /** Space-separated MB OAuth scopes granted to the current
       *  session. Surfaced to the client so the UI can decide if
       *  it needs to prompt re-auth before letting a user vote
       *  (e.g. "tag" scope is required for /ws/2/tag posts and
       *  isn't on legacy `profile`-only sessions). */
      mbScope?: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    mbUsername?: string;
    /** MB OAuth access token, JWT-only — never expose this in
     *  `Session` callbacks, the browser never needs it. Used by
     *  server actions that hit authenticated MB endpoints. */
    mbAccessToken?: string;
    /** MB OAuth refresh token, JWT-only. Used by the jwt callback
     *  to mint a new access token when the current one is about to
     *  expire, so users don't get bounced through OAuth every hour. */
    mbRefreshToken?: string;
    /** Absolute expiry (unix ms) of `mbAccessToken`. Compared in the
     *  jwt callback against `Date.now() + REFRESH_SKEW_MS` to decide
     *  whether to refresh proactively. */
    mbAccessTokenExpiresAt?: number;
    /** Set when a refresh attempt failed in a non-transient way (MB
     *  rejected the refresh token, or no refresh token is on file).
     *  Readers should treat this token as "needs re-auth" — voting
     *  routes can surface the explicit signin loop instead of
     *  letting MB 401 the access token. */
    mbRefreshError?: "no_refresh_token" | "refresh_failed";
    /** Space-separated scopes granted on the most recent sign-in.
     *  Mirrored to `Session.user.mbScope` for client visibility. */
    mbScope?: string;
  }
}
