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
        if (typeof account.access_token === "string") {
          token.mbAccessToken = account.access_token;
        }
        if (typeof account.scope === "string") {
          token.mbScope = account.scope;
        }
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
