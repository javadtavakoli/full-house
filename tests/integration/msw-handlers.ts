import { http, HttpResponse } from "msw";

export const handlers = [
  http.get("https://example.youtrack.cloud/api/users", () =>
    HttpResponse.json([
      { id: "u1", login: "alice", name: "Alice", fullName: "Alice Smith" },
      { id: "u2", login: "bob", name: "Bob", fullName: "Bob Jones" },
    ]),
  ),
  http.get("https://example.youtrack.cloud/api/agiles/B1/sprints/S47", () =>
    HttpResponse.json({
      issues: [
        {
          id: "yt-1",
          idReadable: "FH-100",
          summary: "Foo",
          description: null,
          customFields: [
            { name: "Story Points", projectCustomField: { field: { fieldType: { id: "integer" } } }, value: null },
            { name: "Estimation", projectCustomField: { field: { fieldType: { id: "period" } } }, value: null },
            { name: "State", projectCustomField: { field: { fieldType: { id: "state[1]" } } }, value: { name: "Open", isResolved: false } },
          ],
        },
        {
          id: "yt-2",
          idReadable: "FH-101",
          summary: "Bar",
          description: "details",
          customFields: [
            { name: "Story Points", projectCustomField: { field: { fieldType: { id: "integer" } } }, value: null },
            { name: "Estimation", projectCustomField: { field: { fieldType: { id: "period" } } }, value: null },
            { name: "State", projectCustomField: { field: { fieldType: { id: "state[1]" } } }, value: { name: "Open", isResolved: false } },
          ],
        },
      ],
    }),
  ),
];
