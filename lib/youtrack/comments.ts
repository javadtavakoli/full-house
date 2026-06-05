import { youtrackApi } from "./api";

export async function postIssueComment(
  token: string,
  issueKey: string,
  text: string,
): Promise<{ id: string }> {
  const yt = youtrackApi(token);
  const r = await yt.addComment(issueKey, text);
  return { id: r.id };
}
