import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth/session";
import { readBlob } from "@/lib/auth/encryption-management";

export async function GET() {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const blob = await readBlob(user.id);
  if (!blob) return NextResponse.json({ error: "no account" }, { status: 404 });
  return NextResponse.json(blob);
}
