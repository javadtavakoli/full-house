import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth/session";
import { setIssueMode } from "@/lib/poker/service";
import { broadcastIssueChanged } from "@/lib/pusher/server";

const Body = z.object({
  issueId: z.string().uuid(),
  mode: z.enum(["simple", "advanced"]),
  withEstimation: z.boolean(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  await setIssueMode(id, parsed.data.issueId, user.id, parsed.data.mode, parsed.data.withEstimation);
  await broadcastIssueChanged(id, parsed.data.issueId);
  return NextResponse.json({ ok: true });
}
