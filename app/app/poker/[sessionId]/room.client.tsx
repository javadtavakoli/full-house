"use client";
import type { getSessionView } from "@/lib/poker/service";

type Awaited<T> = T extends Promise<infer U> ? U : T;
type View = NonNullable<Awaited<ReturnType<typeof getSessionView>>>;

export function RoomClient({ initialView, currentUserId }: { initialView: View; currentUserId: string }) {
  const { session, members, issues } = initialView;
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-xl font-semibold">{session.sprintName}</h1>
      <p className="text-sm text-muted-foreground">{members.length} member(s) — {issues.length} issue(s)</p>
      <p className="text-xs text-muted-foreground">you = {currentUserId}</p>
    </div>
  );
}
