import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { SAMPLE_SIZE } from "../../src/indexing/constants.ts";
import { openCaseDb, selectRows } from "../../src/indexing/db.ts";
import { ingestReading } from "../../src/indexing/ingest.ts";
import { runSummary, startRun } from "../../src/indexing/run.ts";
import { buildSample, sampleMentions } from "../../src/indexing/sample.ts";

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

/** Run `run` reads `count` surnames on scan n_1, named `prefix` + number. */
function readSurnames(db: DatabaseSync, run: number, count: number, prefix: string): void {
  ingestReading(db, run, {
    scan: "n_1",
    year: 1912,
    households: [
      {
        key: "h",
        members: Array.from({ length: count }, (_, i) => ({
          key: `p${String(i)}`,
          head: i === 0,
          surname: `${prefix}${String(i)}`,
          box: { x: 10, y: 10 + i * 20, w: 100, h: 15 },
        })),
      },
    ],
  });
}

function startAnotherRun(db: DatabaseSync, model: string): number {
  return startRun(db, { startedAt: "2026-10-23T10:00:00Z", model });
}

const samplePlaces = z.object({
  id: z.number(),
  run_id: z.number(),
  name_mention_id: z.number(),
  rank: z.number(),
  status: z.string(),
  note: z.string().nullable(),
  read_text: z.string().nullable(),
});

function placesOf(db: DatabaseSync, run: number) {
  return selectRows(
    db,
    samplePlaces,
    "select id, run_id, name_mention_id, rank, status, note, read_text from sample where run_id = ? order by rank",
    [run],
  );
}

describe("sample", () => {
  it("takes the configured number of surname places", () => {
    const { db, run } = caseWithSurnames(40);
    expect(buildSample(db, "seed", run)).toHaveLength(SAMPLE_SIZE);
    expect(SAMPLE_SIZE).toBe(20);
  });

  it("is the same on every call and does not change when more is read", () => {
    const { db, run } = caseWithSurnames(40);
    const first = buildSample(db, "seed", run);
    expect(buildSample(db, "seed", run)).toEqual(first);
    expect(buildSample(db, "another seed", run)).toEqual(first);
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
    expect(sampleMentions(db, run)).toEqual(first);
  });

  it("depends on the seed", () => {
    const a = caseWithSurnames(40);
    const b = caseWithSurnames(40);
    expect(buildSample(a.db, "seed-a", a.run)).not.toEqual(buildSample(b.db, "seed-b", b.run));
  });

  it("takes all places when there are fewer than the size", () => {
    const { db, run } = caseWithSurnames(8);
    expect(buildSample(db, "seed", run)).toHaveLength(8);
  });

  it("gives a second run its own sample and leaves the sample of the first one alone", () => {
    const { db, run: first } = caseWithSurnames(40);
    buildSample(db, "seed", first);
    // The first sample has been reviewed: a place fixed, with the agent's reading and a note.
    db.prepare(
      "update sample set status = 'fixed', note = 'виправлено', read_text = 'Старе' where run_id = ? and rank = 3",
    ).run(first);
    const reviewed = placesOf(db, first);

    const second = startAnotherRun(db, "another-model");
    readSurnames(db, second, 30, "Інше");
    const picked = buildSample(db, "seed", second);

    expect(picked).toHaveLength(SAMPLE_SIZE);
    expect(placesOf(db, second).map((place) => place.rank)).toEqual(
      Array.from({ length: SAMPLE_SIZE }, (_, i) => i + 1),
    );
    const texts = selectRows(
      db,
      z.object({ run_id: z.number(), text: z.string() }),
      `select m.run_id, m.text from sample sm join name_mention m on m.id = sm.name_mention_id
        where sm.run_id = ?`,
      [second],
    );
    expect(texts.every((row) => row.run_id === second && row.text.startsWith("Інше"))).toBe(true);
    expect(placesOf(db, first)).toEqual(reviewed);
    expect(sampleMentions(db, second)).toEqual(picked);
  });

  it("builds a sample of its own for a run that read the same scans again", () => {
    const { db, run: first } = caseWithSurnames(40);
    const firstPicked = buildSample(db, "seed", first);
    const second = startAnotherRun(db, "another-model");
    readSurnames(db, second, 40, "Прізвище");
    const secondPicked = buildSample(db, "seed", second);
    expect(secondPicked).toHaveLength(SAMPLE_SIZE);
    expect(secondPicked.filter((id) => firstPicked.includes(id))).toEqual([]);
    expect(sampleMentions(db, first)).toEqual(firstPicked);
  });

  it("refuses an unknown run and a run that has read no surname", () => {
    const { db } = caseWithSurnames(8);
    expect(() => buildSample(db, "seed", 99)).toThrow(/unknown run 99/);
    const empty = startAnotherRun(db, "another-model");
    expect(() => buildSample(db, "seed", empty)).toThrow(/has no surname/);
    expect(placesOf(db, empty)).toEqual([]);
  });
});

describe("run summary", () => {
  it("counts scans and doubts and has no error rate yet", () => {
    const { db, run } = caseWithSurnames(5);
    expect(runSummary(db, run)).toEqual({
      model: "test-model",
      session: "s1",
      effort: null,
      procedureSha: null,
      startedAt: "2026-10-22T10:00:00Z",
      note: null,
      operator: null,
      scansProcessed: 1,
      doubts: 1,
      errorRate: null,
    });
  });
});
