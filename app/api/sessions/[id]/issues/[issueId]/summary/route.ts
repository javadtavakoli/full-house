import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth/session";
import { gatherSummary } from "@/lib/poker/service";

// Prefill data for the "Send to YouTrack" dialog: computed SP and total duration
// (with per-phase breakdown for context). The moderator can override either value
// before the actual sync POST.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; issueId: string }> },
) {
  const { issueId } = await params;
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const summary = await gatherSummary(issueId);
  const phases = [summary.duration.impl, summary.duration.review, summary.duration.test];
  const anyPhaseFinal = phases.some((p) => !p.skipped && p.final !== null);
  const total = anyPhaseFinal ? phases.reduce((s, p) => s + (p.final ?? 0), 0) : null;
  return NextResponse.json({
    sp: summary.sp.skipped ? null : summary.sp.final,
    durationTotal: total,
    perPhase: {
      impl: summary.duration.impl.skipped ? null : summary.duration.impl.final,
      review: summary.duration.review.skipped ? null : summary.duration.review.final,
      test: summary.duration.test.skipped ? null : summary.duration.test.final,
    },
  });
}
