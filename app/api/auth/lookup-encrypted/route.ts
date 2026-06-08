import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { oauthAccounts, users } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

const Body = z.object({
  workspaceUrl: z.string().url(),
  login: z.string().min(1),
});

/**
 * Resolve (workspace, login) → encrypted-blob descriptor so the password-mode
 * sign-in flow can derive the AES key client-side and decrypt the PAT before
 * calling next-auth credentials sign-in.
 *
 * No auth required — the caller hasn't signed in yet. Information disclosed is
 * limited to whether the (workspace, login) pair has a client-mode account
 * (and if so, the random salt + iteration count); not considered sensitive on
 * its own.
 *
 * Always returns 200; `encryptedToken: null` signals no match (works for both
 * "wrong login" and "this user uses PAT mode" — the form maps both to "no
 * account found").
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const cleanWorkspaceUrl = parsed.data.workspaceUrl.trim().replace(/\/$/, "");
  const cleanLogin = parsed.data.login.trim();

  const [row] = await db
    .select({
      encryptedToken: oauthAccounts.accessToken,
      salt: oauthAccounts.passwordSalt,
      iterations: oauthAccounts.pbkdf2Iterations,
    })
    .from(oauthAccounts)
    .innerJoin(users, eq(users.id, oauthAccounts.userId))
    .where(
      and(
        eq(oauthAccounts.workspaceBaseUrl, cleanWorkspaceUrl),
        eq(users.youtrackLogin, cleanLogin),
        eq(oauthAccounts.encryptionMode, "client"),
      ),
    )
    .limit(1);

  if (!row) {
    return NextResponse.json({ encryptedToken: null }, { status: 200 });
  }
  return NextResponse.json(
    {
      encryptedToken: row.encryptedToken,
      salt: row.salt,
      iterations: row.iterations,
    },
    { status: 200 },
  );
}
