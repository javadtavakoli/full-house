import { http, HttpResponse } from "msw";

export const handlers = [
  http.get("https://example.youtrack.cloud/api/agiles/B1/sprints/S47", () =>
    HttpResponse.json({
      issues: [
        { id: "yt-1", idReadable: "FH-100", summary: "Foo", description: null, customFields: [{ name: "State", value: { name: "Open" } }] },
        { id: "yt-2", idReadable: "FH-101", summary: "Bar", description: "details", customFields: [{ name: "State", value: { name: "Open" } }] },
      ],
    }),
  ),
];
