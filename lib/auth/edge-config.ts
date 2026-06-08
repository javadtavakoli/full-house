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
        workspaceUrl: { label: "Workspace URL", type: "text" },
        token: { label: "Personal access token", type: "password" },
        // Optional client-encryption fields. When the form posts these the
        // server stores `encryptedToken` instead of encrypting `token` itself.
        // The plaintext `token` is still required so we can validate against
        // YouTrack at signup time.
        encryptedToken: { type: "text" },
        passwordSalt: { type: "text" },
        encryptionMode: { type: "text" },
      },
      async authorize(creds) {
        const token = typeof creds?.token === "string" ? creds.token.trim() : "";
        // Each user supplies their own workspace URL; fall back to the env
        // default only if the form didn't (legacy flows / e2e).
        const rawWorkspaceUrl =
          typeof creds?.workspaceUrl === "string"
            ? creds.workspaceUrl.trim()
            : (process.env.YT_BASE_URL ?? "");
        if (!token || !rawWorkspaceUrl) return null;
        const baseUrl = rawWorkspaceUrl.replace(/\/$/, "");
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
          // Smuggle the YouTrack `login` through to the signIn callback as a
          // non-standard field on the returned User. We persist it onto
          // users.youtrack_login so the password-mode sign-in can look up the
          // user's encrypted blob by (workspace, login).
          return {
            id: profile.id,
            name: profile.name ?? me.name,
            email: profile.email,
            image: profile.avatarUrl,
            login: profile.login,
          } as unknown as { id: string; name: string | null; email: string | null; image: string | null };
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
