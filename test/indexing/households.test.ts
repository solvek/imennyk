import { describe, expect, it } from "vitest";
import { z } from "zod";
import { openCaseDb } from "../../src/indexing/db.ts";
import { fillHouseholds } from "../../src/indexing/households.ts";
import { ingestReading } from "../../src/indexing/ingest.ts";
import { savePulled } from "../../src/indexing/pull.ts";
import { startRun } from "../../src/indexing/run.ts";
import { addScans } from "../../src/indexing/scans.ts";

const box = { x: 10, y: 10, w: 200, h: 20 };

describe("fillHouseholds", () => {
  it("keeps a continued household when a later image was ingested first", () => {
    const db = openCaseDb(":memory:");
    addScans(db, [
      { name: "1", url: "https://example.test/1", width: 1000, height: 800 },
      { name: "2", url: "https://example.test/2", width: 1000, height: 800 },
      { name: "3", url: "https://example.test/3", width: 1000, height: 800 },
    ]);
    savePulled(db, {
      repositories: [],
      sources: [
        {
          id: 1,
          repo: null,
          type: "confession",
          period_from: null,
          period_to: null,
          title: "Тест",
          callno: "Т-1",
          url: null,
        },
      ],
    });
    const run = startRun(db, { startedAt: "2026-01-01T00:00:00Z", model: "test" });
    const head = {
      key: "a",
      head: true,
      given: "Иванъ",
      gender: "male" as const,
      age: 40,
      box,
      line: "l",
    };
    ingestReading(db, run, {
      scan: "1",
      year: 1912,
      source: 1,
      places: [{ key: "v", name: "Тестоград" }],
      households: [{ key: "h1", place: "v", members: [head] }],
      lines: [{ key: "l", text: "Иванъ" }],
    });
    ingestReading(db, run, {
      scan: "3",
      year: 1912,
      source: 1,
      places: [{ key: "v", name: "Тестоград" }],
      households: [
        {
          key: "h3",
          place: "v",
          members: [{ ...head, key: "c", given: "Петръ" }],
        },
      ],
      lines: [{ key: "l", text: "Петръ" }],
    });
    ingestReading(db, run, {
      scan: "2",
      year: 1912,
      source: 1,
      households: [
        {
          key: "c1",
          continues: { scan: "1", household: "h1" },
          members: [{ key: "b", given: "Вѣра", gender: "female", age: 30, box, line: "l" }],
          ties: [{ person: "b", other: "@head", type: "spouse" }],
        },
      ],
      lines: [{ key: "l", text: "Вѣра" }],
    });
    db.prepare("update person set event_id = null where given = 'Иванъ'").run();
    expect(fillHouseholds(db)).toBe(1);
    const row = z.object({ event_id: z.number() });
    const eventOf = (given: string): number =>
      row.parse(db.prepare("select event_id from person where given = ?").get(given)).event_id;
    expect(eventOf("Иванъ")).toBe(eventOf("Вѣра"));
    expect(eventOf("Петръ")).not.toBe(eventOf("Иванъ"));
  });
});
