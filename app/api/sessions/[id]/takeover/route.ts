import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth/session";
import { takeOverModeration } from "@/lib/poker/service";
import { broadcastMemberUpdated } from "@/lib/pusher/server";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  await takeOverModeration(id, user.id);
  await broadcastMemberUpdated(id);
  return NextResponse.json({ ok: true });
}
