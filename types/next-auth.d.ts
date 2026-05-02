import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      mbUsername?: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    mbUsername?: string;
  }
}
