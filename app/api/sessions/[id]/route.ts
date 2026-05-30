import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth/session";
import { endSession, getRoomSnapshot } from "@/lib/poker/service";
import { broadcastSessionEnded } from "@/lib/pusher/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const snap = await getRoomSnapshot(id);
  if (!snap) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(snap);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  await endSession(id, user.id);
  await broadcastSessionEnded(id);
  return NextResponse.json({ ok: true });
}
