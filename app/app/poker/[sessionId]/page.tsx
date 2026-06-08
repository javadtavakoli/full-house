import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getServerUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { sessions, sessionMembers, users } from "@/lib/db/schema";
import { getRoomSnapshot, joinSession } from "@/lib/poker/service";
import { env } from "@/lib/env";
import { RoomClient } from "./room.client";
import { VoterPicker, type Candidate } from "@/components/poker/voter-picker";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!session) notFound();

  const user = await getServerUser();

  if (user) {
    // Authed visitor — ensure they're a member, then show room.
    await joinSession(sessionId, user.id);
    const snap = await getRoomSnapshot(sessionId);
    if (!snap) notFound();
    return (
      <RoomClient
        initialSnapshot={JSON.parse(JSON.stringify(snap))}
        currentUserId={user.id}
        youtrackBaseUrl={env.YT_BASE_URL}
        userDefaultMode={(user.defaultPokerMode as "simple" | "advanced" | null) ?? "advanced"}
        userDefaultWithEstimation={user.defaultWithEstimation ?? true}
      />
    );
  }

  // Unauthed — render the voter picker.
  const claimedRows = await db
    .select({ youtrackId: users.youtrackId })
    .from(sessionMembers)
    .innerJoin(users, eq(users.id, sessionMembers.userId))
    .where(eq(sessionMembers.sessionId, sessionId));

  const candidates =
    (session.candidates as Candidate[] | null) ?? [];

  return (
    <VoterPicker
      sessionId={sessionId}
      sessionName={session.sprintName}
      candidates={candidates}
      claimedYoutrackIds={claimedRows.map((r) => r.youtrackId)}
    />
  );
}
