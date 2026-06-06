import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser, getYoutrackAccessToken } from "@/lib/auth/session";
import { syncIssue, type SyncOverrides } from "@/lib/poker/sync";

const Body = z.object({
  issueId: z.string().uuid(),
  // Three-state: omitted = use computed default; null = skip the write; number = write that value.
  spOverride: z.number().nullable().optional(),
  durationOverride: z.number().nullable().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await params;
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const token = await getYoutrackAccessToken(user.id);
  if (!token) return NextResponse.json({ error: "no token" }, { status: 401 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Preserve the three states. `null` means "skip the write", which must NOT
  // collapse into `undefined` (which means "use computed default").
  const overrides: SyncOverrides = {};
  if (parsed.data.spOverride !== undefined) overrides.spOverride = parsed.data.spOverride;
  if (parsed.data.durationOverride !== undefined) overrides.durationOverride = parsed.data.durationOverride;

  const result = await syncIssue(parsed.data.issueId, token, overrides);
  return NextResponse.json(result);
}
