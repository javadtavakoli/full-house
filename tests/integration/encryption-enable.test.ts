import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { testDb } from "./setup";
import { handlers } from "./msw-handlers";
import { users, oauthAccounts } from "@/lib/db/schema";
import {
  enableClientEncryption,
  disableClientEncryption,
  readBlob,
} from "@/lib/auth/encryption-management";
import { POST as lookupEncrypted } from "@/app/api/auth/lookup-encrypted/route";
import { encrypt, decrypt } from "@/lib/encryption";
import { eq, and } from "drizzle-orm";

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function newUser(login: string) {
  const [u] = await testDb
    .insert(users)
    .values({
      youtrackId: login + Math.random(),
      email: `${login}@example.com`,
      displayName: login,
      youtrackLogin: login,
    })
    .returning();
  return u!;
}

async function seedServerModeAccount(userId: string, plain: string, workspace: string) {
  const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  await testDb.insert(oauthAccounts).values({
    userId,
    provider: "youtrack",
    accessToken: encrypt(plain, process.env.YT_TOKEN_ENC_KEY!),
    expiresAt: farFuture,
    scope: "PAT",
    workspaceBaseUrl: workspace,
  });
}

describe("encryption management lifecycle", () => {
  const workspace = "https://acme.youtrack.cloud";

  it("readBlob reflects the stored row", async () => {
    const u = await newUser("alice-rb");
    await seedServerModeAccount(u.id, "plain-pat", workspace);
    const blob = await readBlob(u.id);
    expect(blob).not.toBeNull();
    expect(blob!.encryptionMode).toBe("server");
    expect(blob!.salt).toBeNull();
    expect(blob!.iterations).toBe(600_000);
  });

  it("enable → lookup returns the blob; disable → lookup returns null and server can decrypt", async () => {
    const login = "bob-enc";
    const u = await newUser(login);
    await seedServerModeAccount(u.id, "plain-pat", workspace);

    // Simulate the browser doing client-side encryption — the lib doesn't care
    // about the actual bytes, just stores them as-is.
    const fakeEncrypted = "BASE64_CIPHERTEXT_PLACEHOLDER==";
    const fakeSalt = "SALT_PLACEHOLDER==";
    await enableClientEncryption(u.id, {
      encryptedToken: fakeEncrypted,
      salt: fakeSalt,
      iterations: 600_000,
    });

    // Mode + columns are flipped.
    const blob = await readBlob(u.id);
    expect(blob).not.toBeNull();
    expect(blob!.encryptionMode).toBe("client");
    expect(blob!.salt).toBe(fakeSalt);
    expect(blob!.encryptedToken).toBe(fakeEncrypted);

    // Public lookup-encrypted endpoint now finds this user.
    const okRes = await lookupEncrypted(
      new Request("http://test/api/auth/lookup-encrypted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceUrl: workspace, login }),
      }),
    );
    expect(okRes.status).toBe(200);
    const okBody = (await okRes.json()) as {
      encryptedToken: string | null;
      salt: string;
      iterations: number;
    };
    expect(okBody.encryptedToken).toBe(fakeEncrypted);
    expect(okBody.salt).toBe(fakeSalt);
    expect(okBody.iterations).toBe(600_000);

    // Disable: the server re-encrypts the plaintext with its master key. We
    // verify by decrypting again with the same key.
    await disableClientEncryption(u.id, { plainToken: "plain-pat" });
    const after = await readBlob(u.id);
    expect(after!.encryptionMode).toBe("server");
    expect(after!.salt).toBeNull();
    expect(decrypt(after!.encryptedToken, process.env.YT_TOKEN_ENC_KEY!)).toBe("plain-pat");

    // After disable, lookup-encrypted no longer surfaces the row.
    const gone = await lookupEncrypted(
      new Request("http://test/api/auth/lookup-encrypted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceUrl: workspace, login }),
      }),
    );
    const goneBody = (await gone.json()) as { encryptedToken: string | null };
    expect(goneBody.encryptedToken).toBeNull();
  });

  it("lookup-encrypted returns null for unknown login", async () => {
    const res = await lookupEncrypted(
      new Request("http://test/api/auth/lookup-encrypted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceUrl: workspace, login: "no-such-user" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { encryptedToken: string | null };
    expect(body.encryptedToken).toBeNull();
  });

  it("lookup-encrypted rejects malformed body with 400", async () => {
    const res = await lookupEncrypted(
      new Request("http://test/api/auth/lookup-encrypted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: "no-workspace" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("client-mode account survives the round trip through the DB row", async () => {
    const u = await newUser("carol-rt");
    await seedServerModeAccount(u.id, "plain-pat-2", workspace);
    await enableClientEncryption(u.id, {
      encryptedToken: "BLOB",
      salt: "SALT",
      iterations: 12345,
    });
    const [row] = await testDb
      .select()
      .from(oauthAccounts)
      .where(and(eq(oauthAccounts.userId, u.id), eq(oauthAccounts.provider, "youtrack")))
      .limit(1);
    expect(row!.accessToken).toBe("BLOB");
    expect(row!.passwordSalt).toBe("SALT");
    expect(row!.pbkdf2Iterations).toBe(12345);
    expect(row!.encryptionMode).toBe("client");
  });
});
