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
    async jwt({ token, profile }) {
      if (profile && "sub" in profile && typeof profile.sub === "string") {
        token.mbUsername = profile.sub;
      }
      return token;
    },
    async session({ session, token }) {
      if (typeof token.mbUsername === "string") {
        session.user.mbUsername = token.mbUsername;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
