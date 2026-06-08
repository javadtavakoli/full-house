import { NextResponse } from "next/server";
import { getServerUser, getYoutrackContext } from "@/lib/auth/session";
import { listBoards } from "@/lib/youtrack/boards";

export async function GET(req: Request) {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const ctx = await getYoutrackContext(req, user.id);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const boards = await listBoards(ctx.token, ctx.baseUrl);
  return NextResponse.json({ boards });
}
