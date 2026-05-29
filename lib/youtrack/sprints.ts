import { youtrackFetch } from "./client";

export type YtSprint = {
  id: string;
  name: string;
  archived: boolean;
  start: number;
  finish: number;
};

export async function listSprints(token: string, boardId: string): Promise<YtSprint[]> {
  const data = await youtrackFetch<YtSprint[]>(`/api/agiles/${boardId}/sprints`, {
    token,
    query: { fields: "id,name,archived,start,finish" },
  });
  return data.filter((s) => !s.archived);
}

export function pickDefaultSprint(sprints: YtSprint[], nowMs: number): YtSprint | null {
  const active = sprints.filter((s) => s.start <= nowMs && nowMs <= s.finish);
  if (active.length > 0) {
    const current = active[0]!;
    const next = sprints
      .filter((s) => s.start > current.finish)
      .sort((a, b) => a.start - b.start)[0];
    return next ?? current;
  }
  // No active sprint — return the next upcoming one, else the most recent past
  const upcoming = sprints.filter((s) => s.start > nowMs).sort((a, b) => a.start - b.start)[0];
  if (upcoming) return upcoming;
  return sprints.sort((a, b) => b.finish - a.finish)[0] ?? null;
}
