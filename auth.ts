import NextAuth from "next-auth";
import MusicBrainz from "@/lib/auth/musicbrainz";

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
      // Persist the MB OAuth access token + scope on the JWT so
      // server actions can hit MB's authenticated endpoints (tag
      // voting on /ws/2/tag) without bouncing back through the
      // OAuth flow on every call. The `account` callback param is
      // populated only at sign-in / re-auth, so we only update on
      // those events — afterwards the token persists in the JWT.
      if (account) {
        // Temporary diagnostic for the tag-vote re-auth loop: confirm
        // the jwt callback IS running with `account` populated on
        // re-auth, and that account.access_token is the string-typed
        // field we expect. If this log never appears post-consent,
        // NextAuth isn't routing the OAuth callback through this
        // callback at all (cookie / handler-mismatch issue).
        console.log(
          `[auth-jwt] account-present provider=${account.provider} has_access_token=${typeof account.access_token === "string"} scope=${account.scope ?? "<undefined>"}`,
        );
        if (typeof account.access_token === "string") {
          token.mbAccessToken = account.access_token;
        }
        // MB's token endpoint doesn't echo back the granted scope in
        // its JSON response, so `account.scope` is undefined for our
        // provider. Fall back to the scope we REQUESTED at sign-in
        // time — that's what the user just consented to in the OAuth
        // bounce. If MB silently downgrades (rare), the bearer will
        // 401 on the protected endpoint and the client surfaces a
        // generic vote-failed message.
        token.mbScope =
          typeof account.scope === "string" ? account.scope : "profile tag";
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
