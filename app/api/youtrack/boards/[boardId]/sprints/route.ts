import { NextResponse } from "next/server";
import { getServerUser, getYoutrackAccessToken } from "@/lib/auth/session";
import { listSprints, pickDefaultSprint } from "@/lib/youtrack/sprints";

export async function GET(_req: Request, { params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const ytAuth = await getYoutrackAccessToken(user.id);
  if (!ytAuth) return NextResponse.json({ error: "no token" }, { status: 401 });
  const sprints = await listSprints(ytAuth.token, boardId, ytAuth.baseUrl);
  const defaultSprint = pickDefaultSprint(sprints, Date.now());
  return NextResponse.json({ sprints, defaultSprintId: defaultSprint?.id ?? null });
}
