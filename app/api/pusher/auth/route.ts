import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { sessionMembers } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { pusherForAuth } from "@/lib/pusher/server";

export async function POST(req: Request) {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const form = await req.formData();
  const socketId = form.get("socket_id");
  const channelName = form.get("channel_name");
  if (typeof socketId !== "string" || typeof channelName !== "string")
    return NextResponse.json({ error: "bad request" }, { status: 400 });

  const match = channelName.match(/^private-session-([0-9a-f-]{36})$/);
  if (!match) return NextResponse.json({ error: "invalid channel" }, { status: 400 });
  const sessionId = match[1]!;

  const [member] = await db
    .select()
    .from(sessionMembers)
    .where(and(eq(sessionMembers.sessionId, sessionId), eq(sessionMembers.userId, user.id)))
    .limit(1);
  if (!member) return NextResponse.json({ error: "not a member" }, { status: 403 });

  const authResponse = pusherForAuth.authorizeChannel(socketId, channelName);
  return NextResponse.json(authResponse);
}
