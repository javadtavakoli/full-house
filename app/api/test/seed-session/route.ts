import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { sessions, sessionMembers, issues, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const Body = z.object({
  moderatorYoutrackId: z.string(),
  voterYoutrackIds: z.array(z.string()).optional(),
  candidates: z
    .array(
      z.object({
        youtrackId: z.string(),
        login: z.string(),
        name: z.string(),
        fullName: z.string(),
      }),
    )
    .optional(),
});

// Test-only seed: create a session directly in the DB with a hardcoded issue
// list, skipping the YouTrack sprint-issues fetch. Disabled unless
// E2E_TEST=1 is set. Used only by the Playwright E2E test harness.
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production" || process.env.E2E_TEST !== "1") {
    return NextResponse.json({ error: "disabled" }, { status: 404 });
  }
  const body = Body.parse(await req.json());

  const [mod] = await db
    .select()
    .from(users)
    .where(eq(users.youtrackId, body.moderatorYoutrackId))
    .limit(1);
  if (!mod) return NextResponse.json({ error: "moderator not found" }, { status: 400 });

  const [session] = await db
    .insert(sessions)
    .values({
      createdBy: mod.id,
      boardId: "B1",
      sprintId: "S47",
      sprintName: "Sprint 47",
      candidates: body.candidates ?? [],
    })
    .returning();
  if (!session) return NextResponse.json({ error: "session insert failed" }, { status: 500 });

  await db.insert(sessionMembers).values({
    sessionId: session.id,
    userId: mod.id,
    role: "moderator",
  });

  for (const yt of body.voterYoutrackIds ?? []) {
    const [v] = await db.select().from(users).where(eq(users.youtrackId, yt)).limit(1);
    if (v) {
      await db.insert(sessionMembers).values({
        sessionId: session.id,
        userId: v.id,
        role: "voter",
      });
    }
  }

  await db.insert(issues).values({
    sessionId: session.id,
    youtrackIssueId: "yt1",
    issueKey: "FH-1",
    summary: "Test issue",
    description: null,
    position: 0,
  });

  return NextResponse.json({ sessionId: session.id });
}
