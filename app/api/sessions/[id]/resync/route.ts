import { NextResponse } from "next/server";
import { getServerUser, getYoutrackContext } from "@/lib/auth/session";
import { resyncIssuesFromYouTrack } from "@/lib/poker/resync";
import { broadcastIssueChanged } from "@/lib/pusher/server";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  // Resolve the moderator's YouTrack token exactly like the /sync route: server
  // mode decrypts from the DB, client mode reads the x-youtrack-token header.
  const ctx = await getYoutrackContext(req, user.id);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  try {
    const result = await resyncIssuesFromYouTrack(id, user.id, ctx.token);
    // Resync spans the whole issue set; the payload issueId is unused by the
    // client (it re-pulls the full snapshot on any issue-changed event).
    await broadcastIssueChanged(id, "");
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "moderator only") return NextResponse.json({ error: msg }, { status: 403 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
