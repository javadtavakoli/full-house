import { auth } from "./config";
import { db } from "@/lib/db/client";
import { oauthAccounts, users } from "@/lib/db/schema";
import { decrypt } from "@/lib/encryption";
import { env } from "@/lib/env";
import { eq, and } from "drizzle-orm";

export async function getServerUser() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return user ?? null;
}

export async function getYoutrackAccessToken(
  userId: string,
): Promise<{ token: string; baseUrl: string } | null> {
  const [acct] = await db
    .select()
    .from(oauthAccounts)
    .where(and(eq(oauthAccounts.userId, userId), eq(oauthAccounts.provider, "youtrack")))
    .limit(1);
  if (!acct) return null;
  const token = decrypt(acct.accessToken, env.YT_TOKEN_ENC_KEY);
  const baseUrl = acct.workspaceBaseUrl ?? env.YT_BASE_URL;
  return { token, baseUrl };
}

export async function requireServerUser() {
  const u = await getServerUser();
  if (!u) throw new Error("unauthenticated");
  return u;
}
