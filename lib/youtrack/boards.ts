import { youtrackApi } from "./api";

export type YtBoard = { id: string; name: string };

export async function listBoards(token: string, baseUrl?: string): Promise<YtBoard[]> {
  const yt = youtrackApi(token, baseUrl);
  const data = await yt.request("GET", "/agiles", { query: { fields: "id,name" } });
  return data as YtBoard[];
}
