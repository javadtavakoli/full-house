import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { users, oauthAccounts } from "@/lib/db/schema";
import { encrypt } from "@/lib/encryption";
import { env } from "@/lib/env";
import { encode } from "next-auth/jwt";

const Body = z.object({
  youtrackId: z.string(),
  name: z.string(),
  email: z.string(),
});

// Test-only auth bypass. Disabled unless E2E_TEST=1 is set in the server env.
// Inserts/updates a user + a YouTrack oauth account row, then sets the
// Auth.js session-token cookie so subsequent requests authenticate as the
// user. Used only by the Playwright E2E test harness.
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production" || process.env.E2E_TEST !== "1") {
    return NextResponse.json({ error: "disabled" }, { status: 404 });
  }
  const body = Body.parse(await req.json());

  const [user] = await db
    .insert(users)
    .values({
      youtrackId: body.youtrackId,
      email: body.email,
      displayName: body.name,
    })
    .onConflictDoUpdate({
      target: users.youtrackId,
      set: { email: body.email, displayName: body.name },
    })
    .returning();

  if (!user) return NextResponse.json({ error: "user upsert failed" }, { status: 500 });

  const accessToken = encrypt("e2e-token", env.YT_TOKEN_ENC_KEY);
  await db
    .insert(oauthAccounts)
    .values({
      userId: user.id,
      provider: "youtrack",
      accessToken,
      refreshToken: null,
      expiresAt: new Date(Date.now() + 3600_000),
      scope: "YouTrack",
    })
    .onConflictDoUpdate({
      target: [oauthAccounts.userId, oauthAccounts.provider],
      set: {
        accessToken,
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });

  const token = await encode({
    token: { userId: user.id },
    secret: env.AUTH_SECRET,
    salt: "authjs.session-token",
  });

  const res = NextResponse.json({ ok: true, userId: user.id });
  res.cookies.set("authjs.session-token", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  return res;
}
