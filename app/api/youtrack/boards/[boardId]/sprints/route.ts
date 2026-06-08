import { NextResponse } from "next/server";
import { getServerUser, getYoutrackContext } from "@/lib/auth/session";
import { listSprints, pickDefaultSprint } from "@/lib/youtrack/sprints";

export async function GET(req: Request, { params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const ctx = await getYoutrackContext(req, user.id);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const sprints = await listSprints(ctx.token, boardId, ctx.baseUrl);
  const defaultSprint = pickDefaultSprint(sprints, Date.now());
  return NextResponse.json({ sprints, defaultSprintId: defaultSprint?.id ?? null });
}
