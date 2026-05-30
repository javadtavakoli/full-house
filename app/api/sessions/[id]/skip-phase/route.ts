import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser, getYoutrackAccessToken } from "@/lib/auth/session";
import { skipPhase } from "@/lib/poker/service";
import { syncIssue } from "@/lib/poker/sync";
import { broadcastPhaseSkipped, broadcastPhaseChanged } from "@/lib/pusher/server";

const Body = z.object({ issueId: z.string().uuid() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const next = await skipPhase(id, parsed.data.issueId, user.id);
  await broadcastPhaseSkipped(id, parsed.data.issueId);
  await broadcastPhaseChanged(id, parsed.data.issueId, next.status, next.round);
  if (next.status === "completed") {
    const token = await getYoutrackAccessToken(user.id);
    if (token) {
      syncIssue(parsed.data.issueId, token).catch((e) => console.error("sync after completion failed", e));
    }
  }
  return NextResponse.json({ status: next.status, round: next.round });
}
