import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth/session";
import { castVote } from "@/lib/poker/service";
import { broadcastVoteCast } from "@/lib/pusher/server";

const Body = z.object({ issueId: z.string().uuid(), value: z.number() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  await castVote(id, parsed.data.issueId, user.id, parsed.data.value);
  await broadcastVoteCast(id, parsed.data.issueId, user.id);
  return NextResponse.json({ ok: true });
}
