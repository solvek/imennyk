import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openCaseDb } from "../../src/indexing/db.ts";
import { ingestReading } from "../../src/indexing/ingest.ts";
import {
  errorRate,
  findItem,
  fixName,
  listCases,
  listItems,
  listRuns,
  progress,
  recordErrorRate,
  recordedErrorRate,
  reopen,
  reviewTone,
  setStatus,
  type ItemRef,
  type ReviewSet,
} from "../../src/indexing/review.ts";
import { startRun, writeRunErrorRate, runSummary } from "../../src/indexing/run.ts";
import { buildSample } from "../../src/indexing/sample.ts";

const box = (y: number) => ({ x: 10, y, w: 100, h: 15 });

interface Fixture {
  readonly db: DatabaseSync;
  readonly run: number;
}

/** Two scans, two households, six doubts and a sample of four surnames; all names invented. */
function fixture(): Fixture {
  const db = openCaseDb(":memory:");
  db.exec(`
    insert into scan (name, url, width, height) values ('n_1', 'https://example.org/n_1', 2000, 2000);
    insert into scan (name, url, width, height) values ('n_2', 'https://example.org/n_2', 2000, 2000);
  `);
  const run = startRun(db, { startedAt: "2026-10-22T10:00:00Z", model: "test-model" });
  ingestReading(db, run, {
    scan: "n_1",
    year: 1912,
    places: [{ key: "v", name: "Селець", type: "settlement", box: box(5) }],
    households: [
      {
        key: "h1",
        place: "v",
        members: [
          { key: "t", head: true, given: "Тарас", surname: "Петренко", box: box(10) },
          { key: "s", given: "Соломонія", box: box(30) },
          { key: "c", given: "Петро", patronymic: "Тарасовъ", surname: "Петренко", box: box(50) },
        ],
        ties: [{ person: "c", other: "t", type: "child" }],
      },
    ],
    doubts: [
      { element: "surname", person: "t", read: "Петренко", variants: "Петренко", box: box(10) },
      { element: "given", person: "s", read: "Соломонія", box: box(30) },
      { element: "patronymic", person: "c", read: "Тарасовъ", box: box(50) },
      { element: "place", place: "v", read: "Селець", box: box(5) },
      { element: "surname", person: "t", read: "Петренко" },
    ],
  });
  ingestReading(db, run, {
    scan: "n_2",
    year: 1912,
    households: [
      {
        key: "h2",
        members: [
          { key: "i", head: true, given: "Іван", surname: "Шевчук", box: box(10) },
          { key: "x", given: "Ганна", surname: "Шевчук", box: box(30) },
        ],
      },
    ],
    doubts: [{ element: "given", person: "x", read: "Ганна", box: box(30) }],
  });
  buildSample(db, "seed", run, 4);
  return { db, run };
}

function id(db: DatabaseSync, sql: string, ...params: string[]): number {
  const row = db.prepare(sql).get(...params);
  return Number(row?.id);
}

const doubtOf = (db: DatabaseSync, element: string, person: string): number =>
  id(
    db,
    `select d.id from doubt d join person p on p.id = d.person_id
      where d.element = ? and p.given = ? order by d.id`,
    element,
    person,
  );

const placeDoubt = (db: DatabaseSync): number =>
  id(db, "select id from doubt where element = 'place'");

function personField(db: DatabaseSync, personId: number, column: string): unknown {
  return db.prepare(`select ${column} as v from person where id = ?`).get(personId)?.v;
}

const SETS: readonly ReviewSet[] = ["doubt", "sample"];

/** A name item that can be fixed: a surname doubt, or the first place of the sample. */
function nameRef(db: DatabaseSync, set: ReviewSet): ItemRef {
  if (set === "doubt") return { set, id: doubtOf(db, "surname", "Тарас") };
  return { set, id: 1 };
}

describe("listCases", () => {
  it("lists sorted folder names and skips files", () => {
    const root = mkdtempSync(join(tmpdir(), "gortach-cases-"));
    mkdirSync(join(root, "b-case"));
    mkdirSync(join(root, "a-case"));
    writeFileSync(join(root, "readme.md"), "x");
    expect(listCases(root)).toEqual(["a-case", "b-case"]);
  });
});

describe("listItems and progress", () => {
  it("describes doubts and puts open ones first", () => {
    const { db, run } = fixture();
    const first = doubtOf(db, "surname", "Тарас");
    setStatus(db, { set: "doubt", id: first }, "confirmed");
    const items = listItems(db, "doubt", run);
    expect(items).toHaveLength(6);
    expect(items.at(-1)?.id).toBe(first);
    const surname = items.find((item) => item.id === first);
    expect(surname).toMatchObject({
      set: "doubt",
      scan: "n_1",
      url: "https://example.org/n_1",
      element: "surname",
      readText: "Петренко",
      variants: "Петренко",
      status: "confirmed",
      currentValue: "Петренко",
      editable: true,
      scanFile: "n_1.jpg",
      scanWidth: 2000,
      scanHeight: 2000,
      box: { x: 10, y: 10, w: 100, h: 15 },
    });
  });

  it("has no box for a doubt without one, but still the scan", () => {
    const { db, run } = fixture();
    db.exec("update doubt set box_id = null where id = 1");
    const items = listItems(db, "doubt", run).filter((item) => item.box === null);
    expect(items.map((item) => item.id)).toEqual([1]);
    expect(items[0]?.scanFile).toBe("n_1.jpg");
  });

  it("describes places of the sample by their mention", () => {
    const { db, run } = fixture();
    const items = listItems(db, "sample", run);
    expect(items).toHaveLength(4);
    expect(items.map((item) => item.id)).toEqual([1, 2, 3, 4]);
    expect(items.every((item) => item.element === "surname" && item.editable)).toBe(true);
    expect(items[0]?.scanFile).toMatch(/^n_[12]\.jpg$/);
    expect(items[0]?.box).toMatchObject({ w: 100, h: 15 });
  });

  it("filters by element and state", () => {
    const { db, run } = fixture();
    expect(listItems(db, "doubt", run, { element: "given" })).toHaveLength(2);
    setStatus(db, { set: "doubt", id: placeDoubt(db) }, "unknown", "faded");
    expect(listItems(db, "doubt", run, { status: "unknown" })).toHaveLength(1);
    expect(listItems(db, "doubt", run, { status: "open", element: "place" })).toHaveLength(0);
  });

  it("counts progress overall and by element", () => {
    const { db, run } = fixture();
    setStatus(db, { set: "doubt", id: placeDoubt(db) }, "confirmed");
    const result = progress(db, "doubt", run);
    expect(result).toMatchObject({ total: 6, reviewed: 1 });
    expect(result.byElement.map((row) => row.element)).toEqual([
      "given",
      "patronymic",
      "place",
      "surname",
    ]);
    expect(result.byElement.find((row) => row.element === "place")).toEqual({
      element: "place",
      total: 1,
      reviewed: 1,
    });
    expect(progress(db, "sample", run)).toMatchObject({ total: 4, reviewed: 0 });
  });

  it("has no progress for a case without a sample", () => {
    const db = openCaseDb(":memory:");
    const run = startRun(db, { startedAt: "2026-10-22T10:00:00Z", model: "test-model" });
    expect(progress(db, "sample", run)).toEqual({ total: 0, reviewed: 0, byElement: [] });
  });
});

describe.each(SETS)("fixName in the %s set", (set) => {
  it("changes the person and the mentions of the same part, and fixes the item", () => {
    const { db, run } = fixture();
    const ref = nameRef(db, set);
    const before = listItems(db, set, run).find((item) => item.id === ref.id);
    fixName(db, ref, "Заицевскій", "checked");
    const after = listItems(db, set, run).find((item) => item.id === ref.id);
    expect(after).toMatchObject({ status: "fixed", note: "checked", currentValue: "Заицевскій" });
    expect(after?.readText).toBe(before?.readText);
    const personId = after?.personId ?? 0;
    expect(personField(db, personId, "surname")).toBe("Заицевскій");
    const texts = db
      .prepare("select text from name_mention where person_id = ? and kind = 'surname'")
      .all(personId)
      .map((row) => row.text);
    expect(texts).toEqual(["Заицевскій"]);
    expect(personField(db, personId, "given")).not.toBe("Заицевскій");
  });

  it.each(["Заиц…скій", "Зай?", "", "  ", "а..."])("refuses %j and changes nothing", (value) => {
    const { db, run } = fixture();
    const ref = nameRef(db, set);
    const before = JSON.stringify(listItems(db, set, run));
    expect(() => {
      fixName(db, ref, value);
    }).toThrow();
    expect(JSON.stringify(listItems(db, set, run))).toBe(before);
    expect(db.prepare("select count(*) as n from name_mention where text = ?").get(value)?.n).toBe(
      0,
    );
  });

  it("accepts spellings from before the reform", () => {
    const { db, run } = fixture();
    fixName(db, nameRef(db, set), "Тимощукъ");
    expect(listItems(db, set, run).filter((item) => item.status === "fixed")).toHaveLength(1);
  });
});

describe("fixName limits", () => {
  it("refuses a doubt about a place: only name parts are fixed by a value", () => {
    const { db, run } = fixture();
    const ref = { set: "doubt", id: placeDoubt(db) } as const;
    expect(listItems(db, "doubt", run).find((item) => item.id === ref.id)?.editable).toBe(false);
    expect(() => {
      fixName(db, ref, "Щось");
    }).toThrow(/can be fixed/);
    expect(listItems(db, "doubt", run).find((item) => item.id === ref.id)?.status).toBe("open");
  });

  it("changes the patronymic of a doubt about it", () => {
    const { db } = fixture();
    fixName(db, { set: "doubt", id: doubtOf(db, "patronymic", "Петро") }, "Тарасовичъ");
    expect(db.prepare("select patronymic from person where given = 'Петро'").get()).toEqual({
      patronymic: "Тарасовичъ",
    });
  });

  it("changes the given name of a doubt about it", () => {
    const { db } = fixture();
    const ref = { set: "doubt", id: doubtOf(db, "given", "Соломонія") } as const;
    fixName(db, ref, "Соломія");
    expect(db.prepare("select count(*) as n from person where given = 'Соломія'").get()?.n).toBe(1);
    expect(
      db.prepare("select text from name_mention where kind = 'given' and text = 'Соломія'").all(),
    ).toHaveLength(1);
  });

  it("leaves another run's mention alone", () => {
    const { db } = fixture();
    const personId = id(db, "select id from person where given = 'Тарас'");
    const second = startRun(db, { startedAt: "2026-10-23T10:00:00Z", model: "other" });
    db.prepare(
      "insert into name_mention (run_id, scan_id, person_id, kind, text) values (?, 1, ?, 'surname', 'Петренко')",
    ).run(second, personId);
    fixName(db, nameRef(db, "doubt"), "Петриненко");
    expect(
      db
        .prepare("select text from name_mention where run_id = ? and person_id = ?")
        .get(second, personId)?.text,
    ).toBe("Петренко");
  });

  it("refuses an item that does not exist", () => {
    const { db } = fixture();
    expect(() => {
      fixName(db, { set: "sample", id: 99 }, "Х");
    }).toThrow(/no sample 99/);
  });
});

describe.each(SETS)("setStatus and reopen in the %s set", (set) => {
  it("changes the state and the note, not the values", () => {
    const { db, run } = fixture();
    const ref = nameRef(db, set);
    const before = listItems(db, set, run).find((item) => item.id === ref.id);
    setStatus(db, ref, "unknown", "  blurred ");
    const after = listItems(db, set, run).find((item) => item.id === ref.id);
    expect(after).toMatchObject({
      status: "unknown",
      note: "blurred",
      currentValue: before?.currentValue,
    });
    expect(after?.readText).toBe(before?.readText);
    setStatus(db, ref, "confirmed");
    expect(listItems(db, set, run).find((item) => item.id === ref.id)).toMatchObject({
      status: "confirmed",
      note: null,
    });
  });

  it("opens again: state and note go, the fixed value stays", () => {
    const { db, run } = fixture();
    const ref = nameRef(db, set);
    fixName(db, ref, "Тимощукъ", "note");
    reopen(db, ref);
    const item = listItems(db, set, run).find((candidate) => candidate.id === ref.id);
    expect(item).toMatchObject({ status: "open", note: null, currentValue: "Тимощукъ" });
  });
});

describe("the reading of a sample place", () => {
  const place = (db: DatabaseSync, run: number) =>
    listItems(db, "sample", run).find((item) => item.id === 1);

  it("stays the first reading through fix, reopen and review", () => {
    const { db, run } = fixture();
    const ref = { set: "sample", id: 1 } as const;
    const original = place(db, run)?.readText;
    expect(original).toBeDefined();
    fixName(db, ref, "Тимощукъ");
    expect(place(db, run)?.readText).toBe(original);
    reopen(db, ref);
    setStatus(db, ref, "confirmed");
    expect(place(db, run)).toMatchObject({ readText: original, currentValue: "Тимощукъ" });
    expect(db.prepare("select read_text from sample where id = 1").get()?.read_text).toBe(original);
  });

  it("is not stored for a place nobody reviewed", () => {
    const { db } = fixture();
    expect(
      db.prepare("select count(*) as n from sample where read_text is not null").get()?.n,
    ).toBe(0);
  });
});

describe("reviewTone", () => {
  it.each([
    ["open", null],
    ["confirmed", "ok"],
    ["fixed", "error"],
    ["unknown", "error"],
  ] as const)("gives %s the tone %s", (status, tone) => {
    expect(reviewTone(status)).toBe(tone);
  });
});

describe("error rate", () => {
  /** 3 fixed and 1 unreadable of 20: the example of the spec. */
  function twenty(): Fixture {
    const db = openCaseDb(":memory:");
    db.exec("insert into scan (name, url, width, height) values ('n_1', 'u', 5000, 5000)");
    const run = startRun(db, { startedAt: "2026-10-22T10:00:00Z", model: "test-model" });
    ingestReading(db, run, {
      scan: "n_1",
      year: 1912,
      households: [
        {
          key: "h",
          members: Array.from({ length: 20 }, (_, i) => ({
            key: `p${String(i)}`,
            head: i === 0,
            surname: `Прізвище${String(i)}`,
            box: box(10 + i * 20),
          })),
        },
      ],
    });
    buildSample(db, "seed", run, 20);
    return { db, run };
  }

  it("counts fixed and unreadable places of the whole sample", () => {
    const { db, run } = twenty();
    fixName(db, { set: "sample", id: 1 }, "А");
    fixName(db, { set: "sample", id: 2 }, "Б");
    fixName(db, { set: "sample", id: 3 }, "В");
    setStatus(db, { set: "sample", id: 4 }, "unknown");
    setStatus(db, { set: "sample", id: 5 }, "confirmed");
    expect(errorRate(db, run)).toEqual({ runId: run, size: 20, errors: 4, percent: 20 });
  });

  it("rounds to 0.1", () => {
    const { db, run } = twenty();
    db.exec("delete from sample where rank > 3");
    setStatus(db, { set: "sample", id: 1 }, "unknown");
    expect(errorRate(db, run).percent).toBe(33.3);
  });

  it("refuses a run that has no sample, whatever the other runs have", () => {
    const empty = openCaseDb(":memory:");
    const emptyRun = startRun(empty, { startedAt: "2026-10-22T10:00:00Z", model: "test-model" });
    expect(() => errorRate(empty, emptyRun)).toThrow(/not built/);
    const { db, run } = twenty();
    const second = startRun(db, { startedAt: "2026-10-23T10:00:00Z", model: "other" });
    expect(() => errorRate(db, second)).toThrow(/not built/);
    expect(errorRate(db, run).size).toBe(20);
  });

  it("records: open places become correct, the rate goes into the run of the bank", () => {
    const { db, run } = twenty();
    fixName(db, { set: "sample", id: 1 }, "А");
    fixName(db, { set: "sample", id: 2 }, "Б");
    fixName(db, { set: "sample", id: 3 }, "В");
    setStatus(db, { set: "sample", id: 4 }, "unknown");
    const rate = recordErrorRate(db, run);
    expect(rate).toMatchObject({ size: 20, errors: 4, percent: 20 });
    expect(listItems(db, "sample", run, { status: "confirmed" })).toHaveLength(16);
    expect(listItems(db, "sample", run, { status: "open" })).toHaveLength(0);
    expect(runSummary(db, run)).toMatchObject({
      model: "test-model",
      errorRate: { size: 20, errors: 4, percent: 20 },
    });
    expect(recordedErrorRate(db, run)).toEqual({ size: 20, errors: 4, percent: 20 });
  });

  it("records again after one more fix: 25 %", () => {
    const { db, run } = twenty();
    for (const rank of [1, 2, 3]) fixName(db, { set: "sample", id: rank }, `Нове${String(rank)}`);
    setStatus(db, { set: "sample", id: 4 }, "unknown");
    recordErrorRate(db, run);
    fixName(db, { set: "sample", id: 5 }, "Інше");
    expect(recordErrorRate(db, run)).toMatchObject({ errors: 5, percent: 25 });
    expect(recordedErrorRate(db, run)).toEqual({ size: 20, errors: 5, percent: 25 });
  });

  it("has no recorded rate before recording", () => {
    const { db, run } = twenty();
    expect(recordedErrorRate(db, run)).toBeNull();
  });
});

describe("several runs in one case", () => {
  /** The fixture, and a second run that read the first scan again: 2 doubts and a sample of 3. */
  function twoRuns(): { db: DatabaseSync; first: number; second: number } {
    const { db, run: first } = fixture();
    const second = startRun(db, {
      startedAt: "2026-10-23T10:00:00Z",
      model: "other-model",
      note: "second parish",
    });
    ingestReading(db, second, {
      scan: "n_1",
      year: 1912,
      households: [
        {
          key: "h",
          members: [
            { key: "a", head: true, given: "Олена", surname: "Коваль", box: box(10) },
            { key: "b", given: "Марко", surname: "Коваль", box: box(30) },
            { key: "c", given: "Ілько", surname: "Мазур", box: box(50) },
          ],
        },
      ],
      doubts: [
        { element: "surname", person: "a", read: "Коваль", box: box(10) },
        { element: "given", person: "b", read: "Марко", box: box(30) },
      ],
    });
    buildSample(db, "seed", second, 3);
    return { db, first, second };
  }

  it("lists the runs with their model and note", () => {
    const { db, first, second } = twoRuns();
    expect(listRuns(db)).toEqual([
      { id: first, model: "test-model", note: null, startedAt: "2026-10-22T10:00:00Z" },
      {
        id: second,
        model: "other-model",
        note: "second parish",
        startedAt: "2026-10-23T10:00:00Z",
      },
    ]);
  });

  it("keeps items and progress of every run apart, with ranks counted in each sample", () => {
    const { db, first, second } = twoRuns();
    expect(listItems(db, "doubt", first)).toHaveLength(6);
    expect(listItems(db, "doubt", second)).toHaveLength(2);
    expect(listItems(db, "sample", first).map((item) => item.rank)).toEqual([1, 2, 3, 4]);
    expect(listItems(db, "sample", second).map((item) => item.rank)).toEqual([1, 2, 3]);
    const ids = [...listItems(db, "sample", first), ...listItems(db, "sample", second)].map(
      (item) => item.id,
    );
    expect(new Set(ids).size).toBe(7);

    const doubt = listItems(db, "doubt", second)[0];
    expect(doubt).toBeDefined();
    if (doubt === undefined) return;
    setStatus(db, { set: "doubt", id: doubt.id }, "confirmed");
    expect(progress(db, "doubt", first)).toMatchObject({ total: 6, reviewed: 0 });
    expect(progress(db, "doubt", second)).toMatchObject({ total: 2, reviewed: 1 });
    expect(progress(db, "sample", first)).toMatchObject({ total: 4, reviewed: 0 });
    expect(progress(db, "sample", second)).toMatchObject({ total: 3, reviewed: 0 });
  });

  it("does not find an item through another run", () => {
    const { db, first, second } = twoRuns();
    for (const set of ["doubt", "sample"] as const) {
      const ofFirst = listItems(db, set, first)[0];
      const ofSecond = listItems(db, set, second)[0];
      expect(ofFirst).toBeDefined();
      expect(ofSecond).toBeDefined();
      if (ofFirst === undefined || ofSecond === undefined) return;
      expect(findItem(db, { set, id: ofFirst.id }, first)?.id).toBe(ofFirst.id);
      expect(findItem(db, { set, id: ofFirst.id }, second)).toBeUndefined();
      expect(findItem(db, { set, id: ofSecond.id }, first)).toBeUndefined();
    }
  });

  it("counts the error rate of each run on its own sample", () => {
    const { db, first, second } = twoRuns();
    const ofSecond = listItems(db, "sample", second)[0];
    if (ofSecond === undefined) throw new Error("no place in the sample of the second run");
    setStatus(db, { set: "sample", id: ofSecond.id }, "unknown");
    expect(errorRate(db, first)).toEqual({ runId: first, size: 4, errors: 0, percent: 0 });
    expect(errorRate(db, second)).toEqual({ runId: second, size: 3, errors: 1, percent: 33.3 });
  });

  it("records the rate of one run without touching the other run", () => {
    const { db, first, second } = twoRuns();
    const firstBefore = runSummary(db, first);
    const ofSecond = listItems(db, "sample", second)[0];
    if (ofSecond === undefined) throw new Error("no place in the sample of the second run");
    fixName(db, { set: "sample", id: ofSecond.id }, "Нове");

    expect(recordErrorRate(db, second)).toMatchObject({ runId: second, errors: 1 });
    expect(listItems(db, "sample", second, { status: "open" })).toHaveLength(0);
    expect(listItems(db, "sample", first, { status: "open" })).toHaveLength(4);
    expect(runSummary(db, first)).toEqual(firstBefore);
    expect(recordedErrorRate(db, first)).toBeNull();
    expect(recordedErrorRate(db, second)).toEqual({ size: 3, errors: 1, percent: 33.3 });
  });
});

describe("writeRunErrorRate", () => {
  it("changes only the rate of the run", () => {
    const { db, run } = fixture();
    const before = runSummary(db, run);
    expect(before.errorRate).toBeNull();
    writeRunErrorRate(db, run, { size: 20, errors: 3, percent: 15 });
    expect(runSummary(db, run)).toEqual({
      ...before,
      errorRate: { size: 20, errors: 3, percent: 15 },
    });
  });

  it("refuses an unknown run and a rate over 100", () => {
    const { db, run } = fixture();
    expect(() => {
      writeRunErrorRate(db, 99, { size: 4, errors: 1, percent: 25 });
    }).toThrow(/unknown run/);
    expect(() => {
      writeRunErrorRate(db, run, { size: 4, errors: 1, percent: 125 });
    }).toThrow();
  });
});
