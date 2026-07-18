import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth/session";
import { setUserDefaults } from "@/lib/poker/service";

const PhaseSchema = z.object({ id: z.string(), name: z.string() });
const Body = z.object({
  defaultPokerMode: z.enum(["simple", "advanced"]).nullable().optional(),
  defaultWithEstimation: z.boolean().nullable().optional(),
  defaultPhases: z.array(PhaseSchema).nullable().optional(),
});

export async function GET() {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  return NextResponse.json({
    defaultPokerMode: user.defaultPokerMode,
    defaultWithEstimation: user.defaultWithEstimation,
    defaultPhases: user.defaultPhases,
  });
}

export async function POST(req: Request) {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  await setUserDefaults(user.id, {
    defaultPokerMode: parsed.data.defaultPokerMode,
    defaultWithEstimation: parsed.data.defaultWithEstimation,
    defaultPhases: parsed.data.defaultPhases,
  });
  return NextResponse.json({ ok: true });
}
