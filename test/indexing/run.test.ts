import { describe, expect, it } from "vitest";
import { openCaseDb } from "../../src/indexing/db.ts";
import { runSummary, startRun } from "../../src/indexing/run.ts";

describe("run operator", () => {
  it("keeps who ran the indexing", () => {
    const db = openCaseDb(":memory:");
    const run = startRun(db, {
      startedAt: "2026-11-11T10:00:00Z",
      model: "m",
      operator: "[Jane Doe](mailto:jane@example.org)",
    });
    expect(runSummary(db, run).operator).toBe("[Jane Doe](mailto:jane@example.org)");
  });

  it("is empty for a run made without one", () => {
    const db = openCaseDb(":memory:");
    expect(
      runSummary(db, startRun(db, { startedAt: "2026-11-11T10:00:00Z", model: "m" })).operator,
    ).toBeNull();
  });

  it("refuses a blank operator", () => {
    const db = openCaseDb(":memory:");
    expect(() =>
      startRun(db, { startedAt: "2026-11-11T10:00:00Z", model: "m", operator: " " }),
    ).toThrow();
  });
});
