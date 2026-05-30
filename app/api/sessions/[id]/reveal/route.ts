import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth/session";
import { reveal } from "@/lib/poker/service";
import { broadcastVotesRevealed, broadcastPhaseChanged } from "@/lib/pusher/server";

const Body = z.object({ issueId: z.string().uuid() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const next = await reveal(id, parsed.data.issueId, user.id);
  await broadcastPhaseChanged(id, parsed.data.issueId, next.status, next.round);
  await broadcastVotesRevealed(id, parsed.data.issueId);
  return NextResponse.json({ status: next.status });
}
