import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth/session";
import { joinSession } from "@/lib/poker/service";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  await joinSession(id, user.id);
  return NextResponse.json({ ok: true });
}
