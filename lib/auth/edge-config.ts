import type { NextAuthConfig } from "next-auth";
import { YoutrackProvider } from "./youtrack-provider";

export const authConfig = {
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt" as const },
  providers: [
    YoutrackProvider({
      clientId: process.env.YT_OAUTH_CLIENT_ID ?? "",
      clientSecret: process.env.YT_OAUTH_CLIENT_SECRET ?? "",
      workspaceBaseUrl: process.env.YT_BASE_URL ?? "",
    }),
  ],
  pages: { signIn: "/login" },
  callbacks: {
    async session({ session, token }) {
      if (token.userId && session.user) {
        (session.user as { id?: string }).id = token.userId as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
