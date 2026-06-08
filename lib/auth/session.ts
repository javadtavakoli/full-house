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
  // Server-mode accounts can be decrypted here. Client-mode rows store an
  // opaque ciphertext that this server key can't unwrap; callers MUST use
  // getYoutrackContext (which reads the x-youtrack-token header) instead.
  if (acct.encryptionMode === "client") return null;
  const token = decrypt(acct.accessToken, env.YT_TOKEN_ENC_KEY);
  const baseUrl = acct.workspaceBaseUrl ?? env.YT_BASE_URL;
  return { token, baseUrl };
}

/**
 * Resolve { token, baseUrl } for a YouTrack-touching request, handling both
 * encryption modes:
 *   - server mode: decrypts the stored ciphertext with the master key.
 *   - client mode: takes the plaintext from the `x-youtrack-token` request
 *     header. The header is set by `ytFetch` in the browser from
 *     sessionStorage. Returns 412 when the header is missing — the UI can
 *     prompt the user to sign in again with their password.
 *
 * Returned `status` is the HTTP status the caller should respond with on
 * error: 401 = no account at all, 412 = client mode and no token header.
 */
export async function getYoutrackContext(
  req: Request,
  userId: string,
): Promise<
  | { token: string; baseUrl: string }
  | { error: string; status: 401 | 412 }
> {
  const [acct] = await db
    .select()
    .from(oauthAccounts)
    .where(and(eq(oauthAccounts.userId, userId), eq(oauthAccounts.provider, "youtrack")))
    .limit(1);
  if (!acct) return { error: "no account", status: 401 };
  const baseUrl = acct.workspaceBaseUrl ?? env.YT_BASE_URL;

  if (acct.encryptionMode === "client") {
    const token = req.headers.get("x-youtrack-token");
    if (!token) return { error: "password required", status: 412 };
    return { token, baseUrl };
  }

  const token = decrypt(acct.accessToken, env.YT_TOKEN_ENC_KEY);
  return { token, baseUrl };
}

export async function requireServerUser() {
  const u = await getServerUser();
  if (!u) throw new Error("unauthenticated");
  return u;
}
