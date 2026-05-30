import { notFound, redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth/session";
import { getSessionView, joinSession } from "@/lib/poker/service";
import { RoomClient } from "./room.client";

export default async function RoomPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const user = await getServerUser();
  if (!user) redirect(`/login?next=/app/poker/${sessionId}`);
  await joinSession(sessionId, user.id);
  const view = await getSessionView(sessionId);
  if (!view) notFound();
  return <RoomClient initialView={view} currentUserId={user.id} />;
}
