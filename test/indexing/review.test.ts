import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { z } from "zod";
import { openCaseDb } from "../../../src/genealogy/indexing/db.ts";
import { ingestReading } from "../../../src/genealogy/indexing/ingest.ts";
import {
  addTieForDoubt,
  deleteTieForDoubt,
  errorRate,
  fixName,
  listCases,
  listItems,
  progress,
  recordErrorRate,
  recordedErrorRate,
  reopen,
  reviewTone,
  setStatus,
  tieCandidates,
  type ItemRef,
  type ReviewSet,
} from "../../../src/genealogy/indexing/review.ts";
import {
  runFileName,
  startRun,
  writeRunErrorRate,
  writeRunReport,
} from "../../../src/genealogy/indexing/run.ts";
import { buildSample } from "../../../src/genealogy/indexing/sample.ts";

function yamlOf(path: string): Record<string, unknown> {
  return z.record(z.string(), z.unknown()).parse(parse(readFileSync(path, "utf8")));
}

const box = (y: number) => ({ x: 10, y, w: 100, h: 15 });

interface Fixture {
  readonly db: DatabaseSync;
  readonly run: number;
}

/** Two scans, three households, six doubts and a sample of four surnames; all names invented. */
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
    households: [
      {
        key: "h1",
        members: [
          { key: "t", head: true, given: "Тарас", surname: "Петренко", box: box(10) },
          { key: "s", given: "Соломонія", box: box(30) },
          { key: "c", given: "Петро", surname: "Петренко", box: box(50) },
        ],
        ties: [{ person: "c", other: "t", type: "child" }],
      },
    ],
    doubts: [
      { element: "surname", person: "t", read: "Петренко", variants: "Петренко", box: box(10) },
      { element: "given", person: "s", read: "Соломонія", box: box(30) },
      { element: "tie", person: "s", read: "Соломонія", note: "no tie", box: box(30) },
      { element: "tie", person: "c", read: "Петро", box: box(50) },
      { element: "age", person: "s", read: "57", box: box(30) },
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
    doubts: [{ element: "tie", person: "x", read: "Ганна", box: box(30) }],
  });
  buildSample(db, "seed", 4);
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
    const { db } = fixture();
    const first = doubtOf(db, "surname", "Тарас");
    setStatus(db, { set: "doubt", id: first }, "confirmed");
    const items = listItems(db, "doubt");
    expect(items).toHaveLength(7);
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
      boxFile: `n_1-d${String(first)}.jpg`,
    });
  });

  it("has no crop file for a doubt without a box", () => {
    const { db } = fixture();
    db.exec("update doubt set box_id = null where id = 1");
    const items = listItems(db, "doubt").filter((item) => item.boxFile === null);
    expect(items.map((item) => item.id)).toEqual([1]);
  });

  it("describes places of the sample by their mention", () => {
    const { db } = fixture();
    const items = listItems(db, "sample");
    expect(items).toHaveLength(4);
    expect(items.map((item) => item.id)).toEqual([1, 2, 3, 4]);
    expect(items.every((item) => item.element === "surname" && item.editable)).toBe(true);
    const mention = id(db, "select name_mention_id as id from sample where rank = ?", "1");
    expect(items[0]?.boxFile).toMatch(new RegExp(`^n_[12]-m${String(mention)}\\.jpg$`));
  });

  it("filters by element and state", () => {
    const { db } = fixture();
    expect(listItems(db, "doubt", { element: "tie" })).toHaveLength(3);
    setStatus(db, { set: "doubt", id: doubtOf(db, "age", "Соломонія") }, "unknown", "faded");
    expect(listItems(db, "doubt", { status: "unknown" })).toHaveLength(1);
    expect(listItems(db, "doubt", { status: "open", element: "age" })).toHaveLength(0);
  });

  it("shows the ties of the person for a doubt about a tie", () => {
    const { db } = fixture();
    const items = listItems(db, "doubt", { element: "tie" });
    const withTie = items.find((item) => item.ties?.length === 1);
    expect(withTie?.ties?.[0]).toMatchObject({
      type: "child",
      otherName: "Тарас Петренко",
      outgoing: true,
    });
    expect(items.filter((item) => item.ties?.length === 0)).toHaveLength(2);
    expect(listItems(db, "doubt", { element: "age" })[0]?.ties).toBeUndefined();
  });

  it("counts progress overall and by element", () => {
    const { db } = fixture();
    setStatus(db, { set: "doubt", id: doubtOf(db, "age", "Соломонія") }, "confirmed");
    const result = progress(db, "doubt");
    expect(result).toMatchObject({ total: 7, reviewed: 1 });
    expect(result.byElement.find((row) => row.element === "age")).toEqual({
      element: "age",
      total: 1,
      reviewed: 1,
    });
    expect(progress(db, "sample")).toMatchObject({ total: 4, reviewed: 0 });
  });

  it("has no progress for a case without a sample", () => {
    const db = openCaseDb(":memory:");
    expect(progress(db, "sample")).toEqual({ total: 0, reviewed: 0, byElement: [] });
  });
});

describe.each(SETS)("fixName in the %s set", (set) => {
  it("changes the person and the mentions of the same part, and fixes the item", () => {
    const { db } = fixture();
    const ref = nameRef(db, set);
    const before = listItems(db, set).find((item) => item.id === ref.id);
    fixName(db, ref, "Заицевскій", "checked");
    const after = listItems(db, set).find((item) => item.id === ref.id);
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
    const { db } = fixture();
    const ref = nameRef(db, set);
    const before = JSON.stringify(listItems(db, set));
    expect(() => {
      fixName(db, ref, value);
    }).toThrow();
    expect(JSON.stringify(listItems(db, set))).toBe(before);
    expect(db.prepare("select count(*) as n from name_mention where text = ?").get(value)?.n).toBe(
      0,
    );
  });

  it("accepts spellings from before the reform", () => {
    const { db } = fixture();
    fixName(db, nameRef(db, set), "Тимощукъ");
    expect(listItems(db, set).filter((item) => item.status === "fixed")).toHaveLength(1);
  });
});

describe("fixName limits", () => {
  it("refuses doubts that are not about a name", () => {
    const { db } = fixture();
    for (const [element, person] of [
      ["age", "Соломонія"],
      ["tie", "Соломонія"],
    ] as const) {
      const ref = { set: "doubt", id: doubtOf(db, element, person) } as const;
      expect(() => {
        fixName(db, ref, "Щось");
      }).toThrow(/can be fixed/);
      expect(listItems(db, "doubt").find((item) => item.id === ref.id)?.status).toBe("open");
    }
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
    const { db } = fixture();
    const ref = nameRef(db, set);
    const before = listItems(db, set).find((item) => item.id === ref.id);
    setStatus(db, ref, "unknown", "  blurred ");
    const after = listItems(db, set).find((item) => item.id === ref.id);
    expect(after).toMatchObject({
      status: "unknown",
      note: "blurred",
      currentValue: before?.currentValue,
    });
    expect(after?.readText).toBe(before?.readText);
    setStatus(db, ref, "confirmed");
    expect(listItems(db, set).find((item) => item.id === ref.id)).toMatchObject({
      status: "confirmed",
      note: null,
    });
  });

  it("opens again: state and note go, the fixed value stays", () => {
    const { db } = fixture();
    const ref = nameRef(db, set);
    fixName(db, ref, "Тимощукъ", "note");
    reopen(db, ref);
    const item = listItems(db, set).find((candidate) => candidate.id === ref.id);
    expect(item).toMatchObject({ status: "open", note: null, currentValue: "Тимощукъ" });
  });
});

describe("the reading of a sample place", () => {
  const place = (db: DatabaseSync) => listItems(db, "sample").find((item) => item.id === 1);

  it("stays the first reading through fix, reopen and review", () => {
    const { db } = fixture();
    const ref = { set: "sample", id: 1 } as const;
    const original = place(db)?.readText;
    expect(original).toBeDefined();
    fixName(db, ref, "Тимощукъ");
    expect(place(db)?.readText).toBe(original);
    reopen(db, ref);
    setStatus(db, ref, "confirmed");
    expect(place(db)).toMatchObject({ readText: original, currentValue: "Тимощукъ" });
    expect(db.prepare("select read_text from sample where rank = 1").get()?.read_text).toBe(
      original,
    );
  });

  it("is not stored for a place nobody reviewed", () => {
    const { db } = fixture();
    expect(
      db.prepare("select count(*) as n from sample where read_text is not null").get()?.n,
    ).toBe(0);
  });
});

describe("ties", () => {
  it("offers people of the scan and the one before, with the nearest head as default", () => {
    const { db } = fixture();
    const doubt = doubtOf(db, "tie", "Ганна");
    const { candidates, defaultId } = tieCandidates(db, doubt);
    const names = candidates.map((candidate) => candidate.name);
    expect(names).toContain("Тарас Петренко");
    expect(names).toContain("Іван Шевчук");
    expect(names).not.toContain("Ганна Шевчук");
    expect(defaultId).toBe(id(db, "select id from person where given = 'Іван'"));
    expect(candidates.find((candidate) => candidate.personId === defaultId)).toMatchObject({
      isHead: true,
    });
  });

  it("takes the head of the earlier household for a person at the start of a scan", () => {
    const { db } = fixture();
    const { defaultId } = tieCandidates(db, doubtOf(db, "tie", "Соломонія"));
    expect(defaultId).toBe(id(db, "select id from person where given = 'Тарас'"));
  });

  it("adds a tie in reading direction with the event of the head's household", () => {
    const { db } = fixture();
    const doubt = doubtOf(db, "tie", "Соломонія");
    const head = id(db, "select id from person where given = 'Тарас'");
    addTieForDoubt(db, doubt, { otherId: head, type: "child" }, "daughter");
    const tie = db
      .prepare(
        "select * from tie where person_id = (select id from person where given = 'Соломонія')",
      )
      .get();
    expect(tie).toMatchObject({
      other_id: head,
      type: "child",
      box_id: expect.any(Number) as unknown,
    });
    expect(tie?.event_id).toBe(
      id(db, "select id from event where main_person_id = ? and type = 'confession'", String(head)),
    );
    expect(listItems(db, "doubt").find((item) => item.id === doubt)).toMatchObject({
      status: "tie_added",
      note: "daughter",
    });
  });

  it("stores relation, up and down for kin", () => {
    const { db } = fixture();
    const head = id(db, "select id from person where given = 'Тарас'");
    addTieForDoubt(db, doubtOf(db, "tie", "Соломонія"), {
      otherId: head,
      type: "kin",
      relation: "cousin",
      up: 2,
      down: 2,
    });
    expect(db.prepare("select relation, up, down from tie where type = 'kin'").get()).toMatchObject(
      {
        relation: "cousin",
        up: 2,
        down: 2,
      },
    );
  });

  it("refuses a tie to the person themselves, an unknown type and a far-away person", () => {
    const { db } = fixture();
    const doubt = doubtOf(db, "tie", "Соломонія");
    const self = id(db, "select id from person where given = 'Соломонія'");
    const ties = db.prepare("select count(*) as n from tie").get()?.n;
    expect(() => {
      addTieForDoubt(db, doubt, { otherId: self, type: "child" });
    }).toThrow(/themselves/);
    expect(() => {
      addTieForDoubt(db, doubt, { otherId: self + 1, type: "cousin" });
    }).toThrow(/unknown tie type/);
    expect(() => {
      addTieForDoubt(db, doubt, { otherId: 9999, type: "child" });
    }).toThrow(/scan/);
    expect(db.prepare("select count(*) as n from tie").get()?.n).toBe(ties);
    expect(listItems(db, "doubt").find((item) => item.id === doubt)?.status).toBe("open");
  });

  it("refuses a tie for a doubt that is not about a tie", () => {
    const { db } = fixture();
    expect(() => {
      addTieForDoubt(db, doubtOf(db, "age", "Соломонія"), { otherId: 1, type: "child" });
    }).toThrow(/about a tie/);
  });

  it("deletes a tie with its attributes and closes the doubt", () => {
    const { db } = fixture();
    const doubt = doubtOf(db, "tie", "Петро");
    const tieId = id(db, "select id from tie");
    db.prepare(
      "insert into attribute (run_id, scan_id, type, tie_id, value) values (1, 1, 'note', ?, 'adopted')",
    ).run(tieId);
    deleteTieForDoubt(db, doubt, tieId);
    expect(db.prepare("select count(*) as n from tie").get()?.n).toBe(0);
    expect(
      db.prepare("select count(*) as n from attribute where tie_id is not null").get()?.n,
    ).toBe(0);
    expect(listItems(db, "doubt").find((item) => item.id === doubt)?.status).toBe("tie_deleted");
  });

  it("refuses to delete the tie of another person", () => {
    const { db } = fixture();
    const tieId = id(db, "select id from tie");
    const doubt = doubtOf(db, "tie", "Ганна");
    expect(() => {
      deleteTieForDoubt(db, doubt, tieId);
    }).toThrow(/does not belong/);
    expect(db.prepare("select count(*) as n from tie").get()?.n).toBe(1);
    expect(listItems(db, "doubt").find((item) => item.id === doubt)?.status).toBe("open");
  });
});

describe("reviewTone", () => {
  it.each([
    ["open", null],
    ["confirmed", "ok"],
    ["fixed", "error"],
    ["unknown", "error"],
    ["tie_added", "error"],
    ["tie_deleted", "error"],
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
    buildSample(db, "seed", 20);
    return { db, run };
  }

  it("counts fixed and unreadable places of the whole sample", () => {
    const { db, run } = twenty();
    fixName(db, { set: "sample", id: 1 }, "А");
    fixName(db, { set: "sample", id: 2 }, "Б");
    fixName(db, { set: "sample", id: 3 }, "В");
    setStatus(db, { set: "sample", id: 4 }, "unknown");
    setStatus(db, { set: "sample", id: 5 }, "confirmed");
    expect(errorRate(db)).toEqual({ runId: run, size: 20, errors: 4, percent: 20 });
  });

  it("rounds to 0.1", () => {
    const { db } = twenty();
    db.exec("delete from sample where rank > 3");
    setStatus(db, { set: "sample", id: 1 }, "unknown");
    expect(errorRate(db).percent).toBe(33.3);
  });

  it("refuses a missing sample and a sample of several runs", () => {
    const empty = openCaseDb(":memory:");
    expect(() => errorRate(empty)).toThrow(/not built/);
    const { db } = twenty();
    const second = startRun(db, { startedAt: "2026-10-23T10:00:00Z", model: "other" });
    db.prepare(
      "update name_mention set run_id = ? where id = (select name_mention_id from sample where rank = 1)",
    ).run(second);
    expect(() => errorRate(db)).toThrow(/several runs/);
  });

  it("records: open places become correct, the rate goes to the metafile of the run", () => {
    const { db, run } = twenty();
    const dir = mkdtempSync(join(tmpdir(), "gortach-run-"));
    writeRunReport(db, run, dir);
    fixName(db, { set: "sample", id: 1 }, "А");
    fixName(db, { set: "sample", id: 2 }, "Б");
    fixName(db, { set: "sample", id: 3 }, "В");
    setStatus(db, { set: "sample", id: 4 }, "unknown");
    const rate = recordErrorRate(db, dir);
    expect(rate).toMatchObject({ size: 20, errors: 4, percent: 20 });
    expect(listItems(db, "sample", { status: "confirmed" })).toHaveLength(16);
    expect(listItems(db, "sample", { status: "open" })).toHaveLength(0);
    const yaml: unknown = parse(
      readFileSync(join(dir, runFileName("2026-10-22T10:00:00Z")), "utf8"),
    );
    expect(yaml).toMatchObject({ wer: 20, sample_errors: 4, sample_size: 20, model: "test-model" });
    expect(recordedErrorRate(db, dir)).toEqual({ size: 20, errors: 4, percent: 20 });
  });

  it("records again after one more fix: 25 %", () => {
    const { db } = twenty();
    const dir = mkdtempSync(join(tmpdir(), "gortach-run-"));
    for (const rank of [1, 2, 3]) fixName(db, { set: "sample", id: rank }, `Нове${String(rank)}`);
    setStatus(db, { set: "sample", id: 4 }, "unknown");
    recordErrorRate(db, dir);
    fixName(db, { set: "sample", id: 5 }, "Інше");
    expect(recordErrorRate(db, dir)).toMatchObject({ errors: 5, percent: 25 });
    expect(recordedErrorRate(db, dir)).toEqual({ size: 20, errors: 5, percent: 25 });
  });

  it("has no recorded rate before recording", () => {
    const { db } = twenty();
    expect(recordedErrorRate(db, mkdtempSync(join(tmpdir(), "gortach-run-")))).toBeNull();
  });
});

describe("writeRunErrorRate", () => {
  it("changes only the three fields of an existing metafile", () => {
    const { db, run } = fixture();
    const dir = mkdtempSync(join(tmpdir(), "gortach-run-"));
    const path = writeRunReport(db, run, dir);
    const before = yamlOf(path);
    writeRunErrorRate(db, run, dir, { size: 20, errors: 3, percent: 15 });
    const after = yamlOf(path);
    expect(after).toEqual({ ...before, wer: 15, sample_errors: 3, sample_size: 20 });
    expect(before.wer).toBeNull();
  });

  it("creates the metafile when there is none", () => {
    const { db, run } = fixture();
    const dir = mkdtempSync(join(tmpdir(), "gortach-run-"));
    const path = writeRunErrorRate(db, run, dir, { size: 4, errors: 1, percent: 25 });
    expect(parse(readFileSync(path, "utf8"))).toMatchObject({
      model: "test-model",
      wer: 25,
      doubts: 7,
    });
  });
});
