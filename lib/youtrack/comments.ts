import { youtrackFetch } from "./client";

export async function postIssueComment(token: string, issueKey: string, text: string): Promise<{ id: string }> {
  return youtrackFetch<{ id: string }>(`/api/issues/${issueKey}/comments`, {
    token,
    method: "POST",
    query: { fields: "id,text" },
    body: { text },
  });
}
