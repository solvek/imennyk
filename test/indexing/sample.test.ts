import { mkdtempSync, readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { SAMPLE_SIZE } from "../../../src/genealogy/indexing/constants.ts";
import { openCaseDb } from "../../../src/genealogy/indexing/db.ts";
import { ingestReading } from "../../../src/genealogy/indexing/ingest.ts";
import { runFileName, startRun, writeRunReport } from "../../../src/genealogy/indexing/run.ts";
import { buildSample, sampleMentions } from "../../../src/genealogy/indexing/sample.ts";

function caseWithSurnames(count: number): { db: DatabaseSync; run: number } {
  const db = openCaseDb(":memory:");
  db.prepare("insert into scan (name, url, width, height) values ('n_1', 'u', 2000, 2000)").run();
  const run = startRun(db, {
    startedAt: "2026-10-22T10:00:00Z",
    model: "test-model",
    session: "s1",
  });
  const members = Array.from({ length: count }, (_, i) => ({
    key: `p${String(i)}`,
    head: i === 0,
    surname: `Прізвище${String(i)}`,
    box: { x: 10, y: 10 + i * 20, w: 100, h: 15 },
  }));
  ingestReading(db, run, {
    scan: "n_1",
    year: 1912,
    households: [{ key: "h", members }],
    doubts: [
      { element: "surname", person: "p1", read: "Прізвище1", box: { x: 0, y: 0, w: 50, h: 20 } },
    ],
  });
  return { db, run };
}

describe("sample", () => {
  it("takes the configured number of surname places", () => {
    const { db } = caseWithSurnames(40);
    expect(buildSample(db, "seed")).toHaveLength(SAMPLE_SIZE);
    expect(SAMPLE_SIZE).toBe(20);
  });

  it("is the same on every call and does not change when more is read", () => {
    const { db, run } = caseWithSurnames(40);
    const first = buildSample(db, "seed");
    expect(buildSample(db, "seed")).toEqual(first);
    expect(buildSample(db, "another seed")).toEqual(first);
    ingestReading(db, run, {
      scan: "n_1",
      year: 1912,
      households: [
        {
          key: "h2",
          members: [{ key: "x", head: true, surname: "Новий", box: { x: 5, y: 5, w: 9, h: 9 } }],
        },
      ],
    });
    expect(sampleMentions(db)).toEqual(first);
  });

  it("depends on the seed", () => {
    const a = buildSample(caseWithSurnames(40).db, "seed-a");
    const b = buildSample(caseWithSurnames(40).db, "seed-b");
    expect(a).not.toEqual(b);
  });

  it("takes all places when there are fewer than the size", () => {
    const { db } = caseWithSurnames(8);
    expect(buildSample(db, "seed")).toHaveLength(8);
  });
});

describe("run report", () => {
  it("writes counters and an empty WER", () => {
    const { db, run } = caseWithSurnames(5);
    const dir = mkdtempSync(join(tmpdir(), "indexing-run-"));
    const path = writeRunReport(db, run, dir);
    expect(path.endsWith(runFileName("2026-10-22T10:00:00Z"))).toBe(true);
    expect(runFileName("2026-10-22T10:00:00Z")).toBe("run-2026-10-22T10-00-00Z.yaml");
    const report: unknown = parse(readFileSync(path, "utf8"));
    expect(report).toMatchObject({
      model: "test-model",
      session: "s1",
      scans_processed: 1,
      doubts: 1,
      wer: null,
    });
  });
});
