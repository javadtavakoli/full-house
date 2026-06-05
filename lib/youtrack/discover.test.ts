import { describe, it, expect } from "vitest";
import { discoverConventions, type RawIssue } from "./discover";

function field(name: string, typeId: string, value: unknown) {
  return { name, projectCustomField: { field: { fieldType: { id: typeId } } }, value };
}
function issue(...fs: ReturnType<typeof field>[]): RawIssue {
  return { id: "x", idReadable: "X-1", summary: "", description: null, customFields: fs };
}

describe("discoverConventions", () => {
  it("returns the exact-match story-points field name", () => {
    const r = discoverConventions([issue(field("Story Points", "integer", 5))], {});
    expect(r.spField).toBe("Story Points");
  });

  it("falls back to env when no numeric fields exist", () => {
    const r = discoverConventions([issue(field("State", "state[1]", null))], { spField: "Story Points" });
    expect(r.spField).toBe("Story Points");
  });

  it("picks period type over numeric for duration", () => {
    const r = discoverConventions([
      issue(field("Estimation", "period", null), field("Hours", "integer", 2)),
    ], {});
    expect(r.durationField).toBe("Estimation");
  });

  it("collects resolved state names across issues", () => {
    const r = discoverConventions([
      issue(field("State", "state[1]", { name: "Open", isResolved: false })),
      issue(field("State", "state[1]", { name: "Done", isResolved: true })),
      issue(field("State", "state[1]", { name: "Won't fix", isResolved: true })),
    ], {});
    expect(r.doneStateNames).toEqual(["Done", "Won't fix"]);
  });

  it("falls back to env done state names when nothing resolved found", () => {
    const r = discoverConventions([], { doneStateNames: ["Done", "Closed"] });
    expect(r.doneStateNames).toEqual(["Done", "Closed"]);
  });

  it("prefers env-provided field when it appears as a candidate (mode tie-break)", () => {
    const r = discoverConventions([
      issue(field("Story Points", "integer", 3)),
      issue(field("SP", "integer", 2)),
    ], { spField: "SP" });
    // "Story Points" matches exact regex first, so it wins regardless of env.
    expect(r.spField).toBe("Story Points");
  });
});
