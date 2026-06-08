import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth/session";
import { disableClientEncryption } from "@/lib/auth/encryption-management";

const Body = z.object({
  plainToken: z.string().min(1),
});

export async function POST(req: Request) {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  await disableClientEncryption(user.id, parsed.data);
  return NextResponse.json({ ok: true });
}
