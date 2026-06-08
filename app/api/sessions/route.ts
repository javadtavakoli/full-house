import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser, getYoutrackContext } from "@/lib/auth/session";
import { createSession } from "@/lib/poker/service";

const Body = z.object({
  boardId: z.string().min(1),
  sprintId: z.string().min(1),
  sprintName: z.string().min(1),
});

export async function POST(req: Request) {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const ctx = await getYoutrackContext(req, user.id);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const session = await createSession({
    creatorUserId: user.id,
    token: ctx.token,
    workspaceBaseUrl: ctx.baseUrl,
    boardId: parsed.data.boardId,
    sprintId: parsed.data.sprintId,
    sprintName: parsed.data.sprintName,
  });
  return NextResponse.json({ sessionId: session.id });
}
