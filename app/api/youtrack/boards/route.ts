import { NextResponse } from "next/server";
import { getServerUser, getYoutrackAccessToken } from "@/lib/auth/session";
import { listBoards } from "@/lib/youtrack/boards";

export async function GET() {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const token = await getYoutrackAccessToken(user.id);
  if (!token) return NextResponse.json({ error: "no token" }, { status: 401 });
  const boards = await listBoards(token);
  return NextResponse.json({ boards });
}
