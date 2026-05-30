import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser, getYoutrackAccessToken } from "@/lib/auth/session";
import { syncIssue } from "@/lib/poker/sync";

const Body = z.object({ issueId: z.string().uuid() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await params;
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const token = await getYoutrackAccessToken(user.id);
  if (!token) return NextResponse.json({ error: "no token" }, { status: 401 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const result = await syncIssue(parsed.data.issueId, token);
  return NextResponse.json(result);
}
