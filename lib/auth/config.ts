import NextAuth from "next-auth";
import { authConfig } from "./edge-config";
import { db } from "@/lib/db/client";
import { users, oauthAccounts } from "@/lib/db/schema";
import { encrypt } from "@/lib/encryption";
import { env } from "@/lib/env";
import { eq } from "drizzle-orm";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account, credentials }) {
      if (account?.provider !== "credentials") return false;
      const raw = (credentials as { token?: unknown } | undefined)?.token;
      const token = typeof raw === "string" ? raw.trim() : "";
      if (!token) return false;
      const youtrackId = String((user as { id?: string }).id ?? "");
      if (!youtrackId) return false;

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
          })
          .returning())[0]!;

      // PATs don't expire — store a far-future sentinel.
      const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      const encryptedToken = encrypt(token, env.YT_TOKEN_ENC_KEY);
      await db
        .insert(oauthAccounts)
        .values({
          userId: userRow.id,
          provider: "youtrack",
          accessToken: encryptedToken,
          refreshToken: null,
          expiresAt: farFuture,
          scope: "PAT",
        })
        .onConflictDoUpdate({
          target: [oauthAccounts.userId, oauthAccounts.provider],
          set: { accessToken: encryptedToken, expiresAt: farFuture, scope: "PAT" },
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
