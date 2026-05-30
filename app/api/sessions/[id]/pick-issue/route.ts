import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth/session";
import { pickIssue } from "@/lib/poker/service";
import { broadcastIssueChanged, broadcastPhaseChanged } from "@/lib/pusher/server";

const Body = z.object({ issueId: z.string().uuid() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const next = await pickIssue(id, parsed.data.issueId, user.id);
  await broadcastIssueChanged(id, parsed.data.issueId);
  await broadcastPhaseChanged(id, parsed.data.issueId, next.status, next.round);
  return NextResponse.json({ status: next.status, round: next.round });
}
