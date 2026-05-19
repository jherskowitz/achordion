import NextAuth from "next-auth";
import MusicBrainz from "@/lib/auth/musicbrainz";
import { maybeRefreshMbToken } from "@/lib/mb-token-refresh";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    MusicBrainz({
      clientId: process.env.AUTH_MUSICBRAINZ_ID,
      clientSecret: process.env.AUTH_MUSICBRAINZ_SECRET,
    }),
  ],
  callbacks: {
    async jwt({ token, profile, account }) {
      if (profile && "sub" in profile && typeof profile.sub === "string") {
        token.mbUsername = profile.sub;
      }
      // Initial sign-in / re-auth: stash the MB OAuth access token +
      // refresh token + absolute expiry timestamp so we can refresh
      // server-side instead of bouncing the user back through OAuth
      // every hour. MB's tokens last ~3600s.
      if (account) {
        if (typeof account.access_token === "string") {
          token.mbAccessToken = account.access_token;
        }
        if (typeof account.refresh_token === "string") {
          token.mbRefreshToken = account.refresh_token;
        }
        if (typeof account.expires_at === "number") {
          // Auth.js normalizes `expires_at` to unix seconds. Convert
          // to ms here so all later comparisons are uniform.
          token.mbAccessTokenExpiresAt = account.expires_at * 1000;
        }
        // MB's token endpoint doesn't echo back the granted scope in
        // its JSON response, so `account.scope` is undefined for our
        // provider. Fall back to the scope we REQUESTED at sign-in
        // time — that's what the user just consented to in the OAuth
        // bounce.
        token.mbScope =
          typeof account.scope === "string" ? account.scope : "profile tag";
        // Clear any prior refresh-failure marker — a fresh sign-in
        // means the refresh-loop guard from a previous expired token
        // is no longer relevant.
        delete token.mbRefreshError;
        return token;
      }

      // No `account` — request after sign-in. Refresh proactively
      // if the access token is within the skew of expiring. Same
      // helper the tag-vote route uses inline so both paths agree
      // on when to refresh and what to do on failure.
      const outcome = await maybeRefreshMbToken({
        accessToken: token.mbAccessToken,
        refreshToken: token.mbRefreshToken,
        expiresAt: token.mbAccessTokenExpiresAt,
      });
      if (!outcome.ok) {
        console.warn(
          `[auth] MB refresh ${outcome.reason} for user=${token.mbUsername ?? "<unknown>"}`,
        );
        token.mbRefreshError = outcome.reason;
        return token;
      }
      if (outcome.refreshed) {
        token.mbAccessToken = outcome.snapshot.accessToken;
        token.mbAccessTokenExpiresAt = outcome.snapshot.expiresAt;
        if (outcome.snapshot.refreshToken) {
          token.mbRefreshToken = outcome.snapshot.refreshToken;
        }
        delete token.mbRefreshError;
      }
      return token;
    },
    async session({ session, token }) {
      if (typeof token.mbUsername === "string") {
        session.user.mbUsername = token.mbUsername;
      }
      // `mbScope` surfaces to the client so the UI can decide whether
      // to render the vote affordance immediately or prompt re-auth on
      // first vote click. The access token stays JWT-only — never
      // leak it to the browser.
      if (typeof token.mbScope === "string") {
        session.user.mbScope = token.mbScope;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
