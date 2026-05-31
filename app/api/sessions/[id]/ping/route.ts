import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { sessionMembers } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  await db
    .update(sessionMembers)
    .set({ lastSeenAt: new Date() })
    .where(and(eq(sessionMembers.sessionId, id), eq(sessionMembers.userId, user.id)));
  return NextResponse.json({ ok: true });
}
