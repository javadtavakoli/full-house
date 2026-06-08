/**
 * Pure DB helpers for the password-encryption settings flow.
 *
 * Lives outside `lib/auth/session.ts` on purpose — it must NOT import next-auth
 * so that integration tests (which run in a vitest ESM context that chokes on
 * the next-auth import chain — see lib/poker/service.ts:38) can call these
 * helpers directly.
 *
 * Route handlers in app/api/user/encryption/* glue these helpers to the
 * authenticated user via getServerUser; tests bypass that layer.
 */
import { db } from "@/lib/db/client";
import { oauthAccounts } from "@/lib/db/schema";
import { encrypt } from "@/lib/encryption";
import { env } from "@/lib/env";
import { and, eq } from "drizzle-orm";

export type EncryptionBlob = {
  encryptedToken: string;
  salt: string | null;
  iterations: number;
  encryptionMode: "server" | "client";
};

/** Reads the user's stored encryption blob — used by the settings UI to
 * re-encrypt under a new password. Returns null when the user has no
 * youtrack account row (shouldn't happen for a logged-in user). */
export async function readBlob(userId: string): Promise<EncryptionBlob | null> {
  const [row] = await db
    .select({
      encryptedToken: oauthAccounts.accessToken,
      salt: oauthAccounts.passwordSalt,
      iterations: oauthAccounts.pbkdf2Iterations,
      encryptionMode: oauthAccounts.encryptionMode,
    })
    .from(oauthAccounts)
    .where(and(eq(oauthAccounts.userId, userId), eq(oauthAccounts.provider, "youtrack")))
    .limit(1);
  if (!row) return null;
  return {
    encryptedToken: row.encryptedToken,
    salt: row.salt,
    iterations: row.iterations,
    encryptionMode: row.encryptionMode as "server" | "client",
  };
}

/** Flip a server-mode account into client mode by storing a client-encrypted
 * blob + salt + iteration count. The plaintext token is gone from the server
 * after this call. */
export async function enableClientEncryption(
  userId: string,
  args: { encryptedToken: string; salt: string; iterations: number },
): Promise<void> {
  await db
    .update(oauthAccounts)
    .set({
      accessToken: args.encryptedToken,
      passwordSalt: args.salt,
      pbkdf2Iterations: args.iterations,
      encryptionMode: "client",
    })
    .where(and(eq(oauthAccounts.userId, userId), eq(oauthAccounts.provider, "youtrack")));
}

/** Replace the client-mode blob (e.g., after a password change). Mode stays client. */
export async function changeClientEncryption(
  userId: string,
  args: { encryptedToken: string; salt: string; iterations: number },
): Promise<void> {
  await db
    .update(oauthAccounts)
    .set({
      accessToken: args.encryptedToken,
      passwordSalt: args.salt,
      pbkdf2Iterations: args.iterations,
      encryptionMode: "client",
    })
    .where(and(eq(oauthAccounts.userId, userId), eq(oauthAccounts.provider, "youtrack")));
}

/** Drop password protection: server re-encrypts the plaintext token with the
 * master key and clears the salt. Mode flips back to server. */
export async function disableClientEncryption(
  userId: string,
  args: { plainToken: string },
): Promise<void> {
  const encryptedToken = encrypt(args.plainToken, env.YT_TOKEN_ENC_KEY);
  await db
    .update(oauthAccounts)
    .set({
      accessToken: encryptedToken,
      passwordSalt: null,
      encryptionMode: "server",
    })
    .where(and(eq(oauthAccounts.userId, userId), eq(oauthAccounts.provider, "youtrack")));
}
