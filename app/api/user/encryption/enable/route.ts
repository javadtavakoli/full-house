import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth/session";
import { enableClientEncryption } from "@/lib/auth/encryption-management";

const Body = z.object({
  encryptedToken: z.string().min(1),
  salt: z.string().min(1),
  iterations: z.number().int().positive(),
});

export async function POST(req: Request) {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  await enableClientEncryption(user.id, parsed.data);
  return NextResponse.json({ ok: true });
}
