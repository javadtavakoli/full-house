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
    async signIn({ user, account, profile }) {
      if (!account || account.provider !== "youtrack" || !profile) return false;
      const youtrackId = String((profile as { id?: string }).id ?? user.id);
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

      await db
        .insert(oauthAccounts)
        .values({
          userId: userRow.id,
          provider: "youtrack",
          accessToken: encrypt(account.access_token ?? "", env.YT_TOKEN_ENC_KEY),
          refreshToken: account.refresh_token ? encrypt(account.refresh_token, env.YT_TOKEN_ENC_KEY) : null,
          expiresAt: new Date((account.expires_at ?? Math.floor(Date.now() / 1000) + 3600) * 1000),
          scope: account.scope ?? "YouTrack",
        })
        .onConflictDoUpdate({
          target: [oauthAccounts.userId, oauthAccounts.provider],
          set: {
            accessToken: encrypt(account.access_token ?? "", env.YT_TOKEN_ENC_KEY),
            refreshToken: account.refresh_token ? encrypt(account.refresh_token, env.YT_TOKEN_ENC_KEY) : null,
            expiresAt: new Date((account.expires_at ?? Math.floor(Date.now() / 1000) + 3600) * 1000),
            scope: account.scope ?? "YouTrack",
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
