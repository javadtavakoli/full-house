import NextAuth from "next-auth";
import { authConfig } from "./edge-config";
import { db } from "@/lib/db/client";
import { users, oauthAccounts, sessions, sessionMembers } from "@/lib/db/schema";
import { encrypt } from "@/lib/encryption";
import { env } from "@/lib/env";
import { broadcastMemberUpdated } from "@/lib/pusher/server";
import { eq } from "drizzle-orm";

type CandidateRow = {
  youtrackId: string;
  login: string;
  name: string;
  fullName: string;
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account, credentials }) {
      if (account?.provider === "voter") {
        const rawSessionId = (credentials as { sessionId?: unknown } | undefined)?.sessionId;
        const rawYoutrackId = (credentials as { youtrackId?: unknown } | undefined)?.youtrackId;
        const sessionId = typeof rawSessionId === "string" ? rawSessionId : "";
        const youtrackId = typeof rawYoutrackId === "string" ? rawYoutrackId : "";
        if (!sessionId || !youtrackId) return false;

        const [session] = await db
          .select()
          .from(sessions)
          .where(eq(sessions.id, sessionId))
          .limit(1);
        if (!session) return false;
        const candidates = (session.candidates as CandidateRow[] | null) ?? [];
        const candidate = candidates.find((c) => c.youtrackId === youtrackId);
        if (!candidate) return false;

        const [existingVoter] = await db
          .select()
          .from(users)
          .where(eq(users.youtrackId, youtrackId))
          .limit(1);
        const voterRow =
          existingVoter ??
          (await db
            .insert(users)
            .values({
              youtrackId,
              email: "",
              displayName:
                candidate.fullName || candidate.name || candidate.login,
              avatarUrl: null,
            })
            .returning())[0]!;

        await db
          .insert(sessionMembers)
          .values({ sessionId, userId: voterRow.id, role: "voter" })
          .onConflictDoNothing();
        // Fire-and-forget — let the moderator's room refresh and see the new face.
        broadcastMemberUpdated(sessionId).catch(() => {});

        return true;
      }

      if (account?.provider !== "credentials") return false;
      const raw = (credentials as { token?: unknown } | undefined)?.token;
      const rawWorkspaceUrl = (credentials as { workspaceUrl?: unknown } | undefined)?.workspaceUrl;
      const token = typeof raw === "string" ? raw.trim() : "";
      if (!token) return false;
      // Workspace URL is now per-user. Fall back to env for clients that
      // haven't been updated to send the field (legacy / e2e).
      const workspaceUrlInput =
        typeof rawWorkspaceUrl === "string" && rawWorkspaceUrl.trim() !== ""
          ? rawWorkspaceUrl.trim()
          : env.YT_BASE_URL;
      if (!workspaceUrlInput) return false;
      const cleanWorkspaceUrl = workspaceUrlInput.replace(/\/$/, "");
      const youtrackId = String((user as { id?: string }).id ?? "");
      if (!youtrackId) return false;

      // YouTrack login smuggled through from authorize() — used for
      // password-mode login lookups (resolves login → encrypted blob).
      const login = (user as { login?: unknown }).login;
      const youtrackLogin = typeof login === "string" && login.trim() !== "" ? login.trim() : null;

      const [existing] = await db.select().from(users).where(eq(users.youtrackId, youtrackId)).limit(1);
      const userRow =
        existing ??
        (await db
          .insert(users)
          .values({
            youtrackId,
            email: user.email ?? "",
            displayName: user.name ?? user.email ?? "Unknown",
            avatarUrl: user.image ?? null,
            youtrackLogin,
          })
          .returning())[0]!;
      // Backfill login on returning users that signed up before this column existed.
      if (existing && !existing.youtrackLogin && youtrackLogin) {
        await db
          .update(users)
          .set({ youtrackLogin })
          .where(eq(users.id, existing.id));
      }

      // Decide what ciphertext + mode to store.
      //   client mode (encryptedToken+passwordSalt provided): store the blob
      //     verbatim — the server can no longer decrypt it. Login still
      //     succeeded because we just validated the plaintext token above.
      //   server mode (default): encrypt with the master key as before.
      const rawEncryptedToken = (credentials as { encryptedToken?: unknown })?.encryptedToken;
      const rawPasswordSalt = (credentials as { passwordSalt?: unknown })?.passwordSalt;
      const rawEncryptionMode = (credentials as { encryptionMode?: unknown })?.encryptionMode;
      const isClientMode =
        rawEncryptionMode === "client" &&
        typeof rawEncryptedToken === "string" &&
        rawEncryptedToken.length > 0 &&
        typeof rawPasswordSalt === "string" &&
        rawPasswordSalt.length > 0;

      const storedToken = isClientMode
        ? (rawEncryptedToken as string)
        : encrypt(token, env.YT_TOKEN_ENC_KEY);
      const storedMode: "server" | "client" = isClientMode ? "client" : "server";
      const storedSalt: string | null = isClientMode ? (rawPasswordSalt as string) : null;

      // PATs don't expire — store a far-future sentinel.
      const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      await db
        .insert(oauthAccounts)
        .values({
          userId: userRow.id,
          provider: "youtrack",
          accessToken: storedToken,
          refreshToken: null,
          expiresAt: farFuture,
          scope: "PAT",
          workspaceBaseUrl: cleanWorkspaceUrl,
          encryptionMode: storedMode,
          passwordSalt: storedSalt,
        })
        .onConflictDoUpdate({
          target: [oauthAccounts.userId, oauthAccounts.provider],
          set: {
            accessToken: storedToken,
            expiresAt: farFuture,
            scope: "PAT",
            workspaceBaseUrl: cleanWorkspaceUrl,
            encryptionMode: storedMode,
            passwordSalt: storedSalt,
          },
        });
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        const [u] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.youtrackId, String((user as { id?: string }).id ?? "")))
          .limit(1);
        if (u) token.userId = u.id;
      }
      return token;
    },
  },
});
