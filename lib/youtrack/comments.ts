import { youtrackApi } from "./api";

export async function postIssueComment(
  token: string,
  issueKey: string,
  text: string,
  baseUrl?: string,
): Promise<{ id: string }> {
  const yt = youtrackApi(token, baseUrl);
  const r = await yt.addComment(issueKey, text);
  return { id: r.id };
}
