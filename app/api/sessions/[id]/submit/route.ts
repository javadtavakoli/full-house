import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth/session";
import { submitFinal } from "@/lib/poker/service";
import { broadcastFinalSubmitted, broadcastPhaseChanged } from "@/lib/pusher/server";

const Body = z.object({ issueId: z.string().uuid(), finalValue: z.number() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const next = await submitFinal(id, parsed.data.issueId, user.id, parsed.data.finalValue);
  await broadcastFinalSubmitted(id, parsed.data.issueId, parsed.data.finalValue);
  await broadcastPhaseChanged(id, parsed.data.issueId, next.status, next.round);
  // Completion no longer auto-syncs to YouTrack — moderator must explicitly
  // open the "Send to YouTrack" dialog to confirm SP and duration values.
  return NextResponse.json({ status: next.status });
}
