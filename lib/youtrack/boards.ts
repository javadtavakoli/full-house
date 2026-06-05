import { youtrackApi } from "./api";

export type YtBoard = { id: string; name: string };

export async function listBoards(token: string): Promise<YtBoard[]> {
  const yt = youtrackApi(token);
  const data = await yt.request("GET", "/agiles", { query: { fields: "id,name" } });
  return data as YtBoard[];
}
