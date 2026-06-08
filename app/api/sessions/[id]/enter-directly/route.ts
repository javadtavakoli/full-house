import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth/session";
import { enterDirectly } from "@/lib/poker/service";
import { broadcastIssueChanged, broadcastPhaseChanged } from "@/lib/pusher/server";

const Body = z.object({
  issueId: z.string().uuid(),
  sp: z.number().nullable(),
  durationTotal: z.number().nullable(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const next = await enterDirectly(id, parsed.data.issueId, user.id, {
    sp: parsed.data.sp,
    durationTotal: parsed.data.durationTotal,
  });
  await broadcastIssueChanged(id, parsed.data.issueId);
  // Reuse phase-changed so the room refresh picks up the jump-to-completed.
  await broadcastPhaseChanged(id, parsed.data.issueId, next.status, 1);
  return NextResponse.json({ status: next.status });
}
