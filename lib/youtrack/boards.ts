import { youtrackFetch } from "./client";

export type YtBoard = { id: string; name: string };

export async function listBoards(token: string): Promise<YtBoard[]> {
  const data = await youtrackFetch<YtBoard[]>("/api/agiles", {
    token,
    query: { fields: "id,name" },
  });
  return data;
}
