import { youtrackApi } from "./api";

export type YtIssue = {
  id: string;
  key: string;
  summary: string;
  description: string | null;
  stateName: string | null;
};

type RawIssue = {
  id: string;
  idReadable: string;
  summary: string;
  description: string | null;
  customFields: Array<{ name: string; value: { name?: string } | null }>;
};

export async function listSprintIssues(
  token: string,
  boardId: string,
  sprintId: string,
  opts: { excludeStates: string[] },
  baseUrl?: string,
): Promise<YtIssue[]> {
  const yt = youtrackApi(token, baseUrl);
  const data = (await yt.request("GET", `/agiles/${boardId}/sprints/${sprintId}`, {
    query: { fields: "issues(id,idReadable,summary,description,customFields(name,value(name)))" },
  })) as { issues?: RawIssue[] };
  const exclude = new Set(opts.excludeStates);
  return (data.issues ?? [])
    .map((i) => ({
      id: i.id,
      key: i.idReadable,
      summary: i.summary,
      description: i.description,
      stateName: i.customFields.find((f) => f.name === "State")?.value?.name ?? null,
    }))
    .filter((i) => !(i.stateName && exclude.has(i.stateName)));
}

export async function updateIssueField(
  token: string,
  issueKey: string,
  fieldName: string,
  value: number | string | null,
  options?: { asPeriodMinutes?: boolean; baseUrl?: string },
): Promise<void> {
  const yt = youtrackApi(token, options?.baseUrl);
  // YouTrack REST requires each customFields entry to include a `$type` discriminator
  // matching the projectCustomField type (and a `$type` on the value for period fields).
  // Without it, the API silently rejects the write with a 400 like "$type is required".
  if (options?.asPeriodMinutes && typeof value === "number") {
    const payload = { minutes: Math.round(value * 60), $type: "PeriodValue" };
    await yt.setCustomFields(issueKey, [
      { name: fieldName, $type: "PeriodIssueCustomField", value: payload },
    ]);
  } else {
    await yt.setCustomFields(issueKey, [
      { name: fieldName, $type: "SimpleIssueCustomField", value },
    ]);
  }
}
