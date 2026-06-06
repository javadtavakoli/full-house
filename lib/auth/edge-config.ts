import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { createApi } from "trackpilot";

export const authConfig = {
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt" as const },
  providers: [
    Credentials({
      name: "YouTrack",
      credentials: {
        token: { label: "Personal access token", type: "password" },
      },
      async authorize(creds) {
        const token = typeof creds?.token === "string" ? creds.token.trim() : "";
        if (!token) return null;
        const baseUrl = (process.env.YT_BASE_URL ?? "").replace(/\/$/, "");
        if (!baseUrl) return null;
        try {
          const yt = createApi({ baseUrl, token });
          const me = await yt.me();
          // me has { name, login } — we need an identity. Fetch /users/me with avatar/email via request().
          const profile = (await yt.request("GET", "/users/me", {
            query: { fields: "id,login,name,email,avatarUrl" },
          })) as {
            id: string;
            login: string;
            name: string;
            email: string;
            avatarUrl: string | null;
          };
          return {
            id: profile.id,
            name: profile.name ?? me.name,
            email: profile.email,
            image: profile.avatarUrl,
          };
        } catch {
          return null;
        }
      },
    }),
    Credentials({
      id: "voter",
      name: "Voter",
      credentials: {
        sessionId: { type: "text" },
        youtrackId: { type: "text" },
      },
      async authorize(creds) {
        const sessionId =
          typeof creds?.sessionId === "string" ? creds.sessionId : "";
        const youtrackId =
          typeof creds?.youtrackId === "string" ? creds.youtrackId : "";
        if (!sessionId || !youtrackId) return null;
        // Don't touch DB here (edge-config must stay DB-free for middleware).
        // The signIn callback (Node runtime) does the real validation.
        return {
          id: youtrackId,
          name: null,
          email: null,
          image: null,
        } as { id: string; name: string | null; email: string | null; image: string | null };
      },
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
